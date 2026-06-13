import { useState, useEffect } from 'react';
import { API_BASE } from '../utils/epubUtils';

export default function Library({ onOpenBook }) {
  const [libraryBooks, setLibraryBooks] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [manageMode, setManageMode] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchInTitle, setSearchInTitle] = useState(true);
  const [searchInContent, setSearchInContent] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchLibrary = () => {
    fetch(`${API_BASE}/books`)
      .then(res => res.json())
      .then(data => setLibraryBooks(data))
      .catch(err => console.error("Failed to load library", err));
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  useEffect(() => {
    if (!searchInContent || searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(() => {
      fetch(`${API_BASE}/books/search?query=${encodeURIComponent(searchQuery)}`)
        .then(res => res.json())
        .then(data => {
          setSearchResults(data);
          setIsSearching(false);
        })
        .catch(err => {
          console.error("Search failed", err);
          setIsSearching(false);
        });
    }, 500); // debounce so we don't spam the server while typing

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, searchMode]);

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

  const toggleBookSelection = (bookId) => {
    const newSelection = new Set(selectedBooks);
    if (newSelection.has(bookId)) {
      newSelection.delete(bookId);
    } else {
      newSelection.add(bookId);
    }
    setSelectedBooks(newSelection);
  };

  const deleteSelectedBooks = () => {
    if (selectedBooks.size === 0) return;
    
    // Safety confirmation
    if (!window.confirm(`Are you sure you want to delete ${selectedBooks.size} book(s)? This cannot be undone.`)) return;

    setIsDeleting(true);
    const ids = Array.from(selectedBooks).join(',');

    fetch(`${API_BASE}/books?ids=${ids}`, { method: 'DELETE' })
      .then(res => {
        if (!res.ok) throw new Error("Failed to delete books.");
        setManageMode(false);
        setSelectedBooks(new Set());
        fetchLibrary();
      })
      .catch(err => {
        setError(err.message);
        setTimeout(() => setError(null), 5000);
      })
      .finally(() => setIsDeleting(false));
  };

  const handleSearchResultClick = (result) => {
    // pseudo-book object that forces the reader to open the matched chapter
    const bookToOpen = libraryBooks.find(b => b.id === result.bookId);
    if (bookToOpen) {
      onOpenBook({
        ...bookToOpen,
        lastReadChapterIndex: result.chapterIndex,
        lastReadProgress: 0
      });
    }
  };

  const isSearchingActive = searchQuery.trim().length > 0;
  const hasContentMatches = searchResults.length > 0;

  const filteredBooks = libraryBooks.filter(b =>
    b.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.author?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const hasTitleMatches = filteredBooks.length > 0;

  const renderLibraryContent = () => {
    if (isUploading) return <p>Extracting, Indexing, and Saving book...</p>;
    if (error) return <p className="error" style={{ color: '#ff4d4d', textAlign: 'left' }}>{error}</p>;
    if (libraryBooks.length === 0) return <p style={{ marginTop: '50px', color: 'var(--text)' }}>Your library is empty. Click "Add Book" to upload an EPUB.</p>;

    if (isSearchingActive) {
      if (searchInContent && isSearching) {
        return <p>Searching library content...</p>;
      }
      
      // RULE 1: If both are active, and Content has matches -> Render Text Snippets ONLY
      if (searchInContent && hasContentMatches) {
        return (
          <div style={{ textAlign: 'left', width: '100%', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {searchResults.map((result, idx) => (
              <div key={idx} className="book-card" onClick={() => handleSearchResultClick(result)}>
                <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: 'var(--accent)' }}>
                  <strong>{result.bookTitle}</strong> — {result.chapterTitle}
                </p>
                <p style={{ margin: 0, fontSize: '15px', fontStyle: 'italic', color: 'var(--text-h)' }}>"{result.snippet}"</p>
              </div>
            ))}
          </div>
        );
      }
      
      // RULE 2: If Content has no matches (or isn't selected), BUT Title has matches -> Render Library Grid
      if (searchInTitle && hasTitleMatches) {
        return renderGrid(filteredBooks);
      }
      
      // RULE 3: No matches found in either selected option
      return <p>No matches found.</p>;
    }

    // Default: Not searching, render everything
    return renderGrid(libraryBooks);
  };

  const renderGrid = (books) => (
    <div className="library-grid">
      {books.map(book => {
        const isSelected = selectedBooks.has(book.id);
        return (
          <div 
            key={book.id} 
            className={`book-card ${manageMode && isSelected ? 'selected' : ''}`} 
            onClick={() => manageMode ? toggleBookSelection(book.id) : onOpenBook(book)}
          >
            <div className="book-card-inner">
              {manageMode && <div className="select-indicator">✓</div>}

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
              
              {!manageMode && (book.lastReadChapterIndex > 0 || book.lastReadProgress > 0) ? (
                <p style={{ fontSize: '12px', color: 'var(--accent)', margin: '8px 0 0 0' }}>
                  Resume at {Math.min(100, Math.round(((book.lastReadChapterIndex + book.lastReadProgress) / Math.max(1, book.totalChapters)) * 100))}% ➔
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div id="center" style={{ width: '100%', maxWidth: '1000px', margin: 'auto' }}>
      <div className="library-header">
        <h1 style={{ margin: 0 }}>My Library</h1>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {manageMode ? (
            <>
              <button 
                className="counter btn-danger" 
                onClick={deleteSelectedBooks}
                disabled={selectedBooks.size === 0 || isDeleting}
                style={{ marginBottom: 0 }}
              >
                {isDeleting ? "Deleting..." : `Delete (${selectedBooks.size})`}
              </button>
              <button className="counter" style={{ marginBottom: 0 }} onClick={() => { setManageMode(false); setSelectedBooks(new Set()); }}>
                Cancel
              </button>
            </>
          ) : (
            <>
              {libraryBooks.length > 0 && (
                <button className="counter" style={{ marginBottom: 0 }} onClick={() => setManageMode(true)}>
                  Manage
                </button>
              )}
              <div className="upload-btn-wrapper">
                <button className="counter" style={{ marginBottom: 0 }}>+ Add Book</button>
                <input type="file" accept=".epub" onChange={handleFileUpload} disabled={isUploading} />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="search-container">
        <input 
          type="text" 
          className="search-bar"
          placeholder="Search your library..." 
          value={searchQuery} 
          onChange={e => setSearchQuery(e.target.value)} 
          disabled={manageMode}
        />
        
        <div className="search-options">
          <label className="search-checkbox">
            <input 
              type="checkbox" 
              checked={searchInTitle} 
              onChange={e => setSearchInTitle(e.target.checked)} 
              disabled={manageMode}
            />
            Search Title/Author
          </label>
          <label className="search-checkbox">
            <input 
              type="checkbox" 
              checked={searchInContent} 
              onChange={e => setSearchInContent(e.target.checked)} 
              disabled={manageMode}
            />
            Search Book Content
          </label>
        </div>
      </div>

      {renderLibraryContent()}
    </div>
  );
}