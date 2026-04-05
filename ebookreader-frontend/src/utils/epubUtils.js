import iframeStyles from '../iframe.css?raw';

export const API_BASE = 'http://localhost:8080/api';

export const THEME_CYCLE = {
  dark: 'sepia',
  sepia: 'light',
  light: 'dark',
};

export const themeStyles = {
  dark: { backgroundColor: '#1a1a1a', color: '#e0e0e0' },
  sepia: { backgroundColor: '#f4ecd8', color: '#433422' },
  default: { backgroundColor: '#ffffff', color: '#111111' }
};

export const resolvePath = (basePath, relativePath) => {
  const stack = basePath.split('/').slice(0,-1);
  const parts = relativePath.split('/');
  for (let part of parts) {
    if (part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

export const transformChapterHtml = (html, chapterPath, themeColors, bookId) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const updateUrl = (el, attr) => {
    const val = el.getAttribute(attr);
    if (val && !val.startsWith("http") && !val.startsWith("data:")) {
      const absolutePath = resolvePath(chapterPath, val);
      el.setAttribute(attr, `${API_BASE}/book/asset?bookId=${bookId}&assetPath=${encodeURIComponent(absolutePath)}`);
    }
  };

  doc.querySelectorAll("img, image").forEach(img => updateUrl(img, img.hasAttribute("src") ? "src" : "xlink:href"));
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => updateUrl(link, "href"));

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
    body * { background-color: transparent !important; }
  `;
  doc.head.appendChild(themeStyle);

  return doc.documentElement.outerHTML;
}

export const getExactWidth = (iframeDoc, iframeWin) => {
  return iframeDoc.documentElement.getBoundingClientRect().width || iframeWin.innerWidth;
}