import { useState, useEffect, useRef } from 'react';
import BookmarksPanel from './BookmarksPanel';
import { API_BASE, THEME_CYCLE, themeStyles, resolvePath, transformChapterHtml, getExactWidth } from '../utils/epubUtils';

export default function Reader({ book, onBack }) {
  const [bookInfo, setBookInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [currentChapterIndex, setCurrentChapterIndex] = useState(book.lastReadChapterIndex || 0);
  const [chapterContent, setChapterContent] = useState("");
  const [chapterLoading, setChapterLoading] = useState(false);
  const [theme, setTheme] = useState('dark'); 
  
  const [targetHash, setTargetHash] = useState("");
  const [activeTocHref, setActiveTocHref] = useState(""); 
  const [chapterPage, setChapterPage] = useState(0);
  const [chapterTotalPages, setChapterTotalPages] = useState(1);
  const [startAtLastPage, setStartAtLastPage] = useState(false); 
  const [savedProgress, setSavedProgress] = useState(book.lastReadProgress != null ? book.lastReadProgress : 0);
  
  const [showBookmarks, setShowBookmarks] = useState(false);
  
  const iframeRef = useRef(null);
  const themeRef = useRef(theme);

  useEffect(() => { themeRef.current = theme; }, [theme]);

  // Fetch Book Info
  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/book/info?bookId=${book.id}`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to fetch book info");
        return response.json();
      })
      .then((data) => {
        setBookInfo(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [book.id]);

  // Fetch Chapter Content
  useEffect(() => {
    if (!bookInfo?.spine?.length) return;

    const controller = new AbortController();
    const chapterPath = bookInfo.spine[currentChapterIndex];
    
    setChapterLoading(true);

    fetch(`${API_BASE}/book/chapter?bookId=${book.id}&chapterPath=${encodeURIComponent(chapterPath)}`, { signal: controller.signal })
      .then(res => res.text())
      .then(html => {
        const currentThemeColors = themeStyles[themeRef.current] ?? themeStyles.default;
        const processedHtml = transformChapterHtml(html, chapterPath, currentThemeColors, book.id);
        setChapterContent(processedHtml);
        setChapterLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') console.error("Load failed", err);
      });

    return () => controller.abort();
  }, [bookInfo, currentChapterIndex, book.id]);

  // Save Progress automatically
  useEffect(() => {
    const currentProgress = chapterTotalPages > 0 ? (chapterPage / chapterTotalPages) : 0;
    const formData = new FormData();
    formData.append('bookId', book.id);
    formData.append('chapterIndex', currentChapterIndex);
    formData.append('progress', currentProgress);

    fetch(`${API_BASE}/book/progress`, {
      method: 'POST',
      body: formData
    }).catch(err => console.error("Failed to save progress", err));
  }, [currentChapterIndex, chapterPage, book.id, chapterTotalPages]);

  // Handle Iframe link clicks (Message Listener)
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data?.type !== 'epub-link') return;
      const [targetPath, hash] = decodeURIComponent(e.data.href).split('#');

      const calculatePageForHash = (targetHash) => {
        const iframeDoc = iframeRef.current?.contentDocument;
        const iframeWin = iframeRef.current?.contentWindow;
        if (!iframeDoc || !iframeWin) return;

        const el = iframeDoc.getElementById(targetHash) || iframeDoc.querySelector(`[name="${targetHash}"]`);
        if (el) {
          const absLeft = el.getBoundingClientRect().left + iframeWin.scrollX;
          const page = Math.floor(absLeft / getExactWidth(iframeDoc, iframeWin));
          setChapterPage(page);
        }
      }

      if (!targetPath && hash) {
        calculatePageForHash(hash);
      } else {
        const currentChapterPath = bookInfo.spine[currentChapterIndex];
        const absoluteTargetPath = resolvePath(currentChapterPath, targetPath);
        const targetIndex = bookInfo.spine.indexOf(absoluteTargetPath);

        if (targetIndex !== -1) {
          if (targetIndex === currentChapterIndex) {
            if (hash) calculatePageForHash(hash);
          } else {
            if (hash) setTargetHash(hash);
            setCurrentChapterIndex(targetIndex);
          }
        } else {
          console.warn("Could not find linked chapter in spine:", absoluteTargetPath);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [bookInfo, currentChapterIndex]);

  // Update theme inside iframe dynamically
  useEffect(() => {
    const iframeDoc = iframeRef.current?.contentDocument;
    if (!iframeDoc) return;

    const { backgroundColor, color } = themeStyles[theme] ?? themeStyles.default;
    const themeStyleEl = iframeDoc.getElementById('dynamic-theme');

    if (themeStyleEl) {
      themeStyleEl.textContent = `
        html, body { background-color: ${backgroundColor} !important; color: ${color} !important; }
        body * { background-color: transparent !important; }
      `;
    }
  }, [theme, chapterContent]);

  //  Handle Pagination / Resizing
  useEffect(() => {
    const handleResize = () => {
      const iframeDoc = iframeRef.current?.contentDocument;
      const iframeWin = iframeRef.current?.contentWindow;
      if (!iframeDoc || !iframeWin) return;
       
      const totalWidth = iframeDoc.body.scrollWidth;
      const viewportWidth = getExactWidth(iframeDoc, iframeWin);
      const newTotalPages = Math.max(1, Math.ceil((totalWidth - 5) / viewportWidth));
      
      setChapterTotalPages(newTotalPages);
      setChapterPage(prevPage => {
        const clampedPage = Math.min(prevPage, newTotalPages - 1);
        iframeWin.scrollTo({ left: clampedPage * viewportWidth, behavior: 'instant' });
        return clampedPage;
      });
    }

    window.addEventListener('resize', handleResize);
    const iframeWin = iframeRef.current?.contentWindow;
    if (iframeWin) iframeWin.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (iframeWin) iframeWin.removeEventListener('resize', handleResize);
    };
  }, []);

  const updateDropdownToMatchPage = (currentPageIndex) => {
    if (!bookInfo?.toc || !bookInfo?.spine) return;

    const currentPath = bookInfo.spine[currentChapterIndex];
    const iframeDoc = iframeRef.current?.contentDocument;
    const iframeWin = iframeRef.current?.contentWindow;
    if (!iframeDoc || !iframeWin) return;

    const itemsInFile = bookInfo.toc.filter(item => item.href.split('#')[0] === currentPath);
    if (itemsInFile.length === 0) return;

    let bestMatchHref = itemsInFile[0].href;
    let highestValidPage = -1;

    for (const item of itemsInFile) {
      const hash = item.href.split('#')[1];
      let elPage = 0;
      if (hash) {
        const el = iframeDoc.getElementById(hash) || iframeDoc.querySelector(`[name="${hash}"]`);
        if (el) {
          const absLeft = el.getBoundingClientRect().left + iframeWin.scrollX;
          elPage = Math.floor(absLeft / getExactWidth(iframeDoc, iframeWin));
        }
      }
      if (elPage <= currentPageIndex && elPage >= highestValidPage) {
        bestMatchHref = item.href;
        highestValidPage = elPage;
      }
    }
    setActiveTocHref(bestMatchHref);
  }

  // Sync scroll position when page changes
  useEffect(() => {
    const iframeDoc = iframeRef.current?.contentDocument;
    const iframeWin = iframeRef.current?.contentWindow;
    if (iframeWin && iframeDoc) {
      iframeWin.scrollTo({ left: chapterPage * getExactWidth(iframeDoc, iframeWin), behavior: 'smooth' });
      updateDropdownToMatchPage(chapterPage);
    }
  }, [chapterPage, bookInfo, currentChapterIndex]);

  const handleIframeLoad = () => {
    const iframeDoc = iframeRef.current?.contentDocument;
    const iframeWin = iframeRef.current?.contentWindow;
    if (!iframeDoc || !iframeDoc.body || !iframeWin) return;

    // Slight delay to allow the browser to calculate column widths properly
    setTimeout(() => {
      const totalWidth = iframeDoc.body.scrollWidth;
      const viewportWidth = getExactWidth(iframeDoc, iframeWin);
      const pages = Math.max(1, Math.ceil((totalWidth - 5) / viewportWidth));
      setChapterTotalPages(pages);

      let targetPage = 0;

      if (targetHash) {
        const el = iframeDoc.getElementById(targetHash) || iframeDoc.querySelector(`[name="${targetHash}"]`);
        if (el) {
          const absLeft = el.getBoundingClientRect().left + iframeWin.scrollX;
          targetPage = Math.floor(absLeft / viewportWidth);
        }
        setTargetHash(""); 
      } else if (startAtLastPage) {
        targetPage = pages - 1; 
        setStartAtLastPage(false);
      } else if (savedProgress !== null) {
        targetPage = Math.floor(savedProgress * pages);
        setSavedProgress(null); 
      }
      
      targetPage = Math.min(targetPage, pages - 1);
      setChapterPage(targetPage);
      updateDropdownToMatchPage(targetPage);
    }, 100);
  }

  const handleTocChange = (e) => {
    const selectedHref = e.target.value;
    setActiveTocHref(selectedHref);
    const [targetPath, hash] = selectedHref.split('#');
    const targetIndex = bookInfo.spine.indexOf(targetPath);
    
    if (targetIndex !== -1) {
      if (targetIndex === currentChapterIndex) {
        const iframeDoc = iframeRef.current?.contentDocument;
        const iframeWin = iframeRef.current?.contentWindow;
        if (iframeDoc && iframeWin) {
          if (hash) {
            const el = iframeDoc.getElementById(hash) || iframeDoc.querySelector(`[name="${hash}"]`);
            if (el) {
              const absLeft = el.getBoundingClientRect().left + iframeWin.scrollX;
              setChapterPage(Math.floor(absLeft / getExactWidth(iframeDoc, iframeWin)));
            }
          } else {
            setChapterPage(0);
          }
        }
      } else {
        if (hash) setTargetHash(hash);
        setStartAtLastPage(false);
        setCurrentChapterIndex(targetIndex);
      }
    }
  }

  const goToNext = () => {
    if (chapterPage < chapterTotalPages - 1) setChapterPage(prev => prev + 1);
    else if (currentChapterIndex < bookInfo.spine.length - 1) setCurrentChapterIndex(currentChapterIndex + 1);
  }

  const goToPrev = () => {
    if (chapterPage > 0) setChapterPage(prev => prev - 1);
    else if (currentChapterIndex > 0) {
      setStartAtLastPage(true);
      setCurrentChapterIndex(currentChapterIndex - 1);
    }
  }

  const jumpToBookmark = (bookmark) => {
    if (bookmark.chapterIndex === currentChapterIndex) {
      let targetPage = Math.floor(bookmark.progress * chapterTotalPages);
      setChapterPage(Math.min(targetPage, chapterTotalPages - 1));
    } else {
      setSavedProgress(bookmark.progress);
      setCurrentChapterIndex(bookmark.chapterIndex);
    }
    setStartAtLastPage(false);
    setTargetHash("");
    if (window.innerWidth < 1024) setShowBookmarks(false);
  }

  const getCurrentChapterTitle = () => {
    if (!bookInfo?.toc || !bookInfo?.spine) return `Section ${currentChapterIndex + 1}`;
    const currentPath = bookInfo.spine[currentChapterIndex];
    const tocItem = bookInfo.toc.find(t => t.href.split('#')[0] === currentPath);
    return tocItem ? tocItem.title : `Section ${currentChapterIndex + 1}`;
  }

  const cycleTheme = () => setTheme(current => THEME_CYCLE[current] ?? 'light');

  if (loading || !bookInfo) return <div className="loading">Loading book details...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const currentThemeConfig = themeStyles[theme] ?? themeStyles.default;

  return (
    <>
      <div id="center">
        <div style={{ position: 'relative', width: '100%', textAlign: 'center' }}>
          <button className="counter" onClick={onBack} style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', margin: 0 }}>
            ← Library
          </button>
          <h1 style={{ fontSize: '32px', margin: '0 0 8px 0' }}>{bookInfo.title}</h1>
          <h2 style={{ fontSize: '18px', margin: 0 }}>By {bookInfo.author}</h2>
        </div>

        <div className='controls-container' style={{ marginTop: '20px' }}>
          <button className="counter nav-button" onClick={goToPrev} disabled={currentChapterIndex === 0 && chapterPage === 0}>Previous</button>
          
          {bookInfo.toc && bookInfo.toc.length > 0 ? (
            <select className="counter toc-select" value={activeTocHref} onChange={handleTocChange}>
              <option value="" disabled>--- Chapters ---</option>
              {bookInfo.toc.map((item, idx) => (
                <option key={idx} value={item.href}>{item.title}</option>
              ))}
            </select>
          ) : null}

          <code className='page-tracker'>Page {chapterPage + 1} of {chapterTotalPages}</code>
          
          <button className="counter nav-button" onClick={goToNext} disabled={currentChapterIndex === bookInfo.spine.length - 1 && chapterPage === chapterTotalPages - 1}>Next</button>
          <button className="counter theme-button" onClick={cycleTheme}>Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}</button>
          
          <button className="counter theme-button" onClick={() => setShowBookmarks(true)}>🔖 Bookmarks</button>
        </div>
      </div>

      <div id="reader" style={{ backgroundColor: currentThemeConfig.backgroundColor }}>
        {chapterLoading ? (
          <p style={{ color: currentThemeConfig.color, textAlign: 'center' }}>Loading chapter text...</p>
        ) : (
          <iframe 
            ref={iframeRef}
            srcDoc={chapterContent} 
            title="Book Reader"
            onLoad={handleIframeLoad}
            className='reader-iframe'
          />
        )}
      </div>

      {showBookmarks && (
        <BookmarksPanel 
          bookId={book.id}
          currentChapterIndex={currentChapterIndex}
          chapterPage={chapterPage}
          chapterTotalPages={chapterTotalPages}
          chapterTitle={getCurrentChapterTitle()}
          onJumpToBookmark={jumpToBookmark}
          onClose={() => setShowBookmarks(false)}
        />
      )}
    </>
  );
}