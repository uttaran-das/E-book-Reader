import { useState, useEffect, useRef } from 'react';
import './App.css';
import iframeStyles from './iframe.css?raw';

const resolvePath = (basePath, relativePath) => {
  const stack = basePath.split('/').slice(0,-1);
  const parts = relativePath.split('/');
  for (let part of parts) {
    if (part === '.') continue;
    if(part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

const transformChapterHtml = (html, chapterPath, resolvePath, themeColors) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Fix Assets (Images & CSS)
  const updateUrl = (el, attr) => {
    const val = el.getAttribute(attr);
    if (val && !val.startsWith("http") && !val.startsWith("data:")) {
      const absolutePath = resolvePath(chapterPath, val);
      el.setAttribute(attr, `http://localhost:8080/api/book/asset?assetPath=${encodeURIComponent(absolutePath)}`);
    }
  };

  doc.querySelectorAll("img, image").forEach(img => {
    updateUrl(img, img.hasAttribute("src") ? "src" : "xlink:href");
  });

  doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => updateUrl(link, "href"));

  // Inject Link Interceptor Script
  const script = doc.createElement('script');
  script.textContent = `
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (a) {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('data:')) {
          e.preventDefault();
          window.parent.postMessage({ type: 'epub-link', href }, '*');
        }
      }
    });
  `;
  doc.body.appendChild(script);

  // Inject Base Styles
  const style = doc.createElement('style');
  style.textContent = iframeStyles;
  doc.head.appendChild(style);

  const themeStyle = doc.createElement('style');
  themeStyle.id = 'dynamic-theme';
  themeStyle.textContent = `
    html, body { 
      background-color: ${themeColors.backgroundColor} !important; 
      color: ${themeColors.color} !important; 
    }
    body * {
      background-color: transparent !important;
    }
  `;
  doc.head.appendChild(themeStyle);

  return doc.documentElement.outerHTML;
}

const THEME_CYCLE = {
  dark: 'sepia',
  sepia: 'light',
  light: 'dark',
};

const themeStyles = {
  dark: { backgroundColor: '#1a1a1a', color: '#e0e0e0' },
  sepia: { backgroundColor: '#f4ecd8', color: '#433422' },
  default: { backgroundColor: '#ffffff', color: '#111111' }
};

function App() {
  const [bookInfo, setBookInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [chapterContent, setChapterContent] = useState("");
  const [chapterLoading, setChapterLoading] = useState(false);
  const [theme, setTheme] = useState('dark'); // dark, sepia, light
  const [targetHash, setTargetHash] = useState("");
  const [activeTocHref, setActiveTocHref] = useState(""); // active dropdown item
  const [chapterPage, setChapterPage] = useState(0);
  const [chapterTotalPages, setChapterTotalPages] = useState(1);
  const [startAtLastPage, setStartAtLastPage] = useState(false); // Used when clicking Previous on page 0
  
  const iframeRef = useRef(null);
  const themeRef = useRef(theme);

  useEffect(() => {themeRef.current = theme;}, [theme]);

  useEffect(() => {
    fetch('http://localhost:8080/api/book/info')
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
  }, []);

  useEffect(() => {
    if (!bookInfo?.toc || !bookInfo?.spine) return;

    const currentPath = bookInfo.spine[currentChapterIndex];
    const activePathBase = activeTocHref.split('#')[0];

    if (currentPath !== activePathBase) {
      const matchingToc = bookInfo.toc.find(item => item.href.split('#')[0] === currentPath);
      setActiveTocHref(matchingToc ? matchingToc.href : "");
    }
  }, [currentChapterIndex, bookInfo, activeTocHref]);

  useEffect(() => {
    if (!bookInfo?.spine?.length) return;

    const controller = new AbortController();
    const chapterPath = bookInfo.spine[currentChapterIndex];
    
    setChapterLoading(true);

    fetch(`http://localhost:8080/api/book/chapter?chapterPath=${encodeURIComponent(chapterPath)}`, { signal: controller.signal })
      .then(res => res.text())
      .then(html => {
        const currentThemeColors = themeStyles[themeRef.current] ?? themeStyles.default;
        const processedHtml = transformChapterHtml(html, chapterPath, resolvePath, currentThemeColors);
        setChapterContent(processedHtml);
        setChapterLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') console.error("Load failed", err);
      });

    return () => controller.abort(); // Cleanup pending fetch if chapter changes fast
  }, [bookInfo, currentChapterIndex, resolvePath]);

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
          const page = Math.floor(absLeft/iframeWin.innerWidth);
          setChapterPage(page);
        }
      }

      // hash link
      if (!targetPath && hash) {
        calculatePageForHash(hash);
      } else {
        // file link
        const currentChapterPath = bookInfo.spine[currentChapterIndex];
        const absoluteTargetPath = resolvePath(currentChapterPath, targetPath);
        const targetIndex = bookInfo.spine.indexOf(absoluteTargetPath);

        if (targetIndex !== -1){
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

  useEffect(() => {
    const iframeDoc = iframeRef.current?.contentDocument;
    if (!iframeDoc) return;

    const { backgroundColor, color } = themeStyles[theme] ?? themeStyles.default;
    const themeStyleEl = iframeDoc.getElementById('dynamic-theme');

    if (themeStyleEl) {
      themeStyleEl.textContent = `
        html, body { 
          background-color: ${backgroundColor} !important; 
          color: ${color} !important; 
        }
        body * {
          background-color: transparent !important;
        }
      `;
    }
  }, [theme]);

  const updateDropdownToMatchPage = (currentPageIndex) => {
    if (!bookInfo.toc || !bookInfo?.spine) return;

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
          elPage = Math.floor(absLeft/iframeWin.innerWidth);
        }
      }
      if (elPage <= currentPageIndex && elPage >= highestValidPage) {
        bestMatchHref = item.href;
        highestValidPage = elPage;
      }
    }

    setActiveTocHref(bestMatchHref);
  }

  useEffect(() => {
    const iframeWin = iframeRef.current?.contentWindow;
    if (iframeWin) {
      iframeWin.scrollTo({ left: chapterPage * iframeWin.innerWidth, behavior: 'smooth' });
      updateDropdownToMatchPage(chapterPage);
    }
  }, [chapterPage, bookInfo, currentChapterIndex]);

  const handleIframeLoad = () => {
    const iframeDoc = iframeRef.current?.contentDocument;
    const iframeWin = iframeRef.current?.contentWindow;
    if (!iframeDoc || !iframeDoc.body || !iframeWin) return;

    // Re-apply theme on a new section
    const { backgroundColor, color } = themeStyles[theme] ?? themeStyles.default;
    const themeStyleEl = iframeDoc.getElementById('dynamic-theme');

    if (themeStyleEl) {
      themeStyleEl.textContent = `
        html, body { 
          background-color: ${backgroundColor} !important; 
          color: ${color} !important; 
        }
        body * {
          background-color: transparent !important;
        }
      `;
    }

    // Slight delay to allow the browser to calculate column widths
    setTimeout(() => {
      const totalWidth = iframeDoc.body.scrollWidth;
      const viewportWidth = iframeWin.innerWidth;
      // -5 pixel buffer prevents browsers from calculating phantom blank pages
      const pages = Math.max(1, Math.ceil((totalWidth-5)/viewportWidth));
      setChapterTotalPages(pages);

      let targetPage = 0;

      if (targetHash) {
        const el = iframeDoc.getElementById(targetHash) || iframeDoc.querySelector(`[name="${targetHash}"]`);
        if (el) {
          const absLeft = el.getBoundingClientRect().left + iframeWin.scrollX;
          targetPage = Math.floor(absLeft/iframeWin.innerWidth);
        }
        setTargetHash(""); // Need to clear hash otherwise it will get stuck
      } else if (startAtLastPage) {
        targetPage = pages-1; // Jump to last page of the chapter we just moved backwards into
        setStartAtLastPage(false);
      }
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
        if (iframeDoc) {
          if (hash) {
            const iframeDoc = iframeRef.current?.contentDocument;
            const iframeWin = iframeRef.current?.contentWindow;
            if (iframeDoc && iframeWin) {
              const el = iframeDoc.getElementById(hash) || iframeDoc.querySelector(`[name="${hash}"]`);
              if (el) {
                const absLeft = el.getBoundingClientRect().left + iframeWin.scrollX;
                setChapterPage(Math.floor(absLeft/iframeWin.innerWidth));
              }
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
    if (chapterPage < chapterTotalPages-1) setChapterPage(prev => prev+1);
    else if (currentChapterIndex < bookInfo.spine.length-1) setCurrentChapterIndex(currentChapterIndex+1);
  }

  const goToPrev = () => {
    if (chapterPage > 0) setChapterPage(prev => prev-1);
    else if(currentChapterIndex > 0) {
      setStartAtLastPage(true); // next chapter to start at its end
      setCurrentChapterIndex(currentChapterIndex-1);
    }
  }

  const cycleTheme = () => setTheme(current => THEME_CYCLE[current] ?? 'light');

  if (loading) return <div className="loading">Loading book details...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const currentThemeConfig = themeStyles[theme] ?? themeStyles.default;

  return (
    <>
      <div id="center">
        <div>
          <h1>{bookInfo.title}</h1>
          <h2>By {bookInfo.author}</h2>
        </div>

        <div className='controls-container'>
          <button 
            className="counter nav-button" 
            onClick={goToPrev} 
            disabled={currentChapterIndex === 0 && chapterPage === 0}
          >
            Previous
          </button>
          
          {bookInfo.toc && bookInfo.toc.length > 0 ? (
            <select
              className="counter toc-select"
              value={activeTocHref}
              onChange={handleTocChange}
            >
              <option value="" disabled>--- Chapters ---</option>
              {bookInfo.toc.map((item, idx) => (
                <option key={idx} value={item.href}>
                  {item.title}
                </option>
              ))}
            </select>
          ) : null}

          <code className='page-tracker'>
            Page {chapterPage+1} of {chapterTotalPages}
          </code>
          
          <button 
            className="counter nav-button" 
            onClick={goToNext} 
            disabled={currentChapterIndex === bookInfo.spine.length - 1 && chapterPage === chapterTotalPages}
          >
            Next
          </button>

          <button className="counter time-button" onClick={cycleTheme}>
            Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}
          </button>
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
            style={{ 
              width: '100%', 
              height: '70vh',
              border: 'none',
              backgroundColor: theme === 'dark' ? '#000' : theme === 'sepia' ? '#f4ecd8' : '#fff'
            }}
          />
        )}
      </div>
    </>
  );
}

export default App;