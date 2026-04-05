import { useState, useEffect } from 'react';
import { API_BASE } from '../utils/epubUtils';

export default function Library({ onOpenBook }) {
  const [libraryBooks, setLibraryBooks] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLibrary = () => {
    fetch(`${API_BASE}/books`)
      .then(res => res.json())
      .then(data => setLibraryBooks(data))
      .catch(err => console.error("Failed to load library", err));
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    fetch(`${API_BASE}/book/upload`, { method: 'POST', body: formData })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to upload book.");
        return data;
      })
      .then(() => {
        setIsUploading(false);
        fetchLibrary();
      })
      .catch((err) => {
        setError(err.message);
        setIsUploading(false);
        setTimeout(() => setError(null), 5000);
      });
  };

  const filteredBooks = libraryBooks.filter(b =>
    b.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.author?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div id="center" style={{ width: '100%', maxWidth: '1000px' }}>
      <div className="library-header">
        <h1 style={{ margin: 0 }}>My Library</h1>
        <div className="upload-btn-wrapper">
          <button className="counter" style={{ marginBottom: 0 }}>+ Add Book</button>
          <input type="file" accept=".epub" onChange={handleFileUpload} />
        </div>
      </div>

      <input 
        type="text" className="search-bar"
        placeholder="Search by title or author..." 
        value={searchQuery} onChange={e => setSearchQuery(e.target.value)} 
      />

      {isUploading && <p>Extracting and saving book...</p>}
      {error && <p className="error" style={{ color: '#ff4d4d', textAlign: 'left', width: '100%' }}>{error}</p>}

      {libraryBooks.length === 0 && !isUploading && !error ? (
        <p style={{ marginTop: '50px', color: 'var(--text)' }}>Your library is empty. Click "Add Book" to upload an EPUB.</p>
      ) : (
        <div className="library-grid">
          {filteredBooks.map(book => (
            <div key={book.id} className="book-card" onClick={() => onOpenBook(book)}>
              {book.coverPath ? (
                <img 
                  className="book-cover" 
                  src={`${API_BASE}/book/asset?bookId=${book.id}&assetPath=${encodeURIComponent(book.coverPath)}`} 
                  alt={`Cover for ${book.title}`} 
                />
              ) : (
                <div className="book-cover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'var(--text)', fontSize: '14px' }}>No Cover</span>
                </div>
              )}
              <p className="book-title">{book.title || "Unknown Title"}</p>
              <p className="book-author">{book.author || "Unknown Author"}</p>
              
              {book.lastReadChapterIndex > 0 || book.lastReadProgress > 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--accent)', margin: '8px 0 0 0' }}>
                  Resume at {Math.min(100, Math.round(((book.lastReadChapterIndex + book.lastReadProgress) / Math.max(1, book.totalChapters)) * 100))}% ➔
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}