import { useState, useEffect, useRef } from 'react';
import './App.css';

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

const transformChapterHtml = (html, chapterPath, resolvePath) => {
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
  style.textContent = `
    body { padding: 5%; font-family: sans-serif; line-height: 1.6; }
    img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
  `;
  doc.head.appendChild(style);

  return doc.documentElement.outerHTML;
}

const THEME_CYCLE = {
  dark: 'sepia',
  sepia: 'light',
  light: 'dark',
};

const themeStyles = {
  dark: { backgroundColor: '#000000', color: '#e0e0e0' },
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
  
  const iframeRef = useRef(null);

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
    if (!bookInfo?.spine?.length) return;

    const controller = new AbortController();
    const chapterPath = bookInfo.spine[currentChapterIndex];
    
    setChapterLoading(true);

    fetch(`http://localhost:8080/api/book/chapter?chapterPath=${encodeURIComponent(chapterPath)}`, { signal: controller.signal })
      .then(res => res.text())
      .then(html => {
        const processedHtml = transformChapterHtml(html, chapterPath, resolvePath);
        setChapterContent(processedHtml);
        setChapterLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') console.error("Load failed", err);
      });

    return () => controller.abort(); // Cleanup pending fetch if chapter changes fast
  }, [bookInfo, currentChapterIndex, resolvePath]);

  useEffect(() => {
    const hanleMessage = (e) => {
      if (e.data?.type !== 'epub-link') return;
      const [targetPath, hash] = decodeURIComponent(e.data.href).split('#');

      const scrollInsideIframe = (targetHash) => {
        const iframeDoc = iframeRef.current?.contentDocument;
        const el = iframeDoc?.getElementById(targetHash) || iframeDoc?.querySelector(`[name="${targetHash}"]`);
        el?.scrollIntoView({ behavior: 'smooth' });
      }

      // hash link
      if (!targetPath && hash) {
        scrollInsideIframe(hash);
      } else {
        // file link
        const currentChapterPath = bookInfo.spine[currentChapterIndex];
        const absoluteTargetPath = resolvePath(currentChapterPath, targetPath);
        const targetIndex = bookInfo.spine.indexOf(absoluteTargetPath);

        if (targetIndex !== -1){
          if (targetIndex === currentChapterIndex) {
            if (hash) scrollInsideIframe(hash);
          } else {
            if (hash) setTargetHash(hash);
            setCurrentChapterIndex(targetIndex);
          }
        } else {
          console.warn("Could not find linked chapter in spine:", absoluteTargetPath);
        }
      }
    };

    window.addEventListener('message', hanleMessage);
    return () => window.removeEventListener('message', hanleMessage);
  }, [bookInfo, currentChapterIndex, resolvePath]);

  useEffect(() => {
    const body = iframeRef.current?.contentDocument?.body;
    if(!body) return;
    const { backgroundColor, color } = themeStyles[theme] ?? themeStyles.default;
    Object.assign(body.style, { backgroundColor, color });
  }, [theme]);

  const handleIframeLoad = () => {
    const iframeDoc = iframeRef.current?.contentDocument;
    if (!iframeDoc || !iframeDoc.body) return;

    // Re-apply theme on a new section
    const { backgroundColor, color } = themeStyles[theme] ?? themeStyles.default;
    Object.assign(iframeDoc.body.style, { backgroundColor, color });
    
    if (targetHash) {
      setTimeout(() => {
        const el = iframeDoc.getElementById(targetHash) || iframeDoc.querySelector(`[name="${targetHash}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
        setTargetHash(""); // Need to clear hash otherwise it will get stuck
      }, 100);
    }
  }

  const goToNext = () => {
    if(currentChapterIndex < bookInfo.spine.length-1) setCurrentChapterIndex(currentChapterIndex+1);
  }

  const goToPrev = () => {
    if(currentChapterIndex > 0) setCurrentChapterIndex(currentChapterIndex-1);
  }

  const cycleTheme = () => setTheme(current => THEME_CYCLE[current] ?? 'light');

  if (loading) return <div className="loading">Loading book details...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <>
      <div id="center">
        <div>
          <h1>{bookInfo.title}</h1>
          <h2>By {bookInfo.author}</h2>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'center' }}>
          <button 
            className="counter" 
            onClick={goToPrev} 
            disabled={currentChapterIndex === 0}
            style={{ marginBottom: 0, cursor: currentChapterIndex === 0 ? 'not-allowed' : 'pointer' }}
          >
            Previous
          </button>
          
          <code>
            Section {currentChapterIndex + 1} of {bookInfo.spine.length}
          </code>
          
          <button 
            className="counter" 
            onClick={goToNext} 
            disabled={currentChapterIndex === bookInfo.spine.length - 1}
            style={{ marginBottom: 0, cursor: currentChapterIndex === bookInfo.spine.length - 1 ? 'not-allowed' : 'pointer' }}
          >
            Next
          </button>

          <button 
            className="counter" onClick={cycleTheme}
            style={{ marginBottom: 0, cursor: 'pointer', marginLeft: '20px' }}
          >
            Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}
          </button>
        </div>
      </div>

      <div id="reader" style={{ padding: 0 }}>
        {chapterLoading ? (
          <p style={{ padding: '32px' }}>Loading chapter text...</p>
        ) : (
          <iframe 
          ref={iframeRef}
            srcDoc={chapterContent} 
            title="Book Reader"
            onLoad={handleIframeLoad}
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