import { useState, useEffect } from 'react';
import { API_BASE } from '../utils/epubUtils';

export default function BookmarksPanel({ 
  bookId, currentChapterIndex, chapterPage, chapterTotalPages, 
  chapterTitle, onJumpToBookmark, onClose 
}) {
  const [bookmarks, setBookmarks] = useState([]);
  const [newBookmarkName, setNewBookmarkName] = useState("");
  const [newBookmarkNote, setNewBookmarkNote] = useState("");

  const fetchBookmarks = () => {
    fetch(`${API_BASE}/book/bookmarks?bookId=${bookId}`)
      .then(res => res.json())
      .then(data => setBookmarks(data))
      .catch(err => console.error("Failed to load bookmarks", err));
  };

  useEffect(() => {
    fetchBookmarks();
  }, [bookId]);

  const handleAddBookmark = (e) => {
    e.preventDefault();
    if (!newBookmarkName.trim()) return;

    const currentProgress = chapterTotalPages > 0 ? (chapterPage / chapterTotalPages) : 0;
    const formData = new FormData();
    formData.append('bookId', bookId);
    formData.append('name', newBookmarkName);
    formData.append('note', newBookmarkNote);
    formData.append('chapterIndex', currentChapterIndex);
    formData.append('chapterTitle', chapterTitle);
    formData.append('progress', currentProgress);

    fetch(`${API_BASE}/book/bookmark`, { method: 'POST', body: formData })
      .then(res => {
        if (res.ok) {
          setNewBookmarkName("");
          setNewBookmarkNote("");
          fetchBookmarks();
        }
      })
      .catch(err => console.error("Failed to save bookmark", err));
  };

  return (
    <div className="bookmarks-panel">
      <div className="bookmark-header">
        <h2 style={{ margin: 0, fontSize: '20px' }}>Bookmarks</h2>
        <button className="close-panel-btn" onClick={onClose}>×</button>
      </div>

      <form className="bookmark-form" onSubmit={handleAddBookmark}>
        <input 
          type="text" 
          className="bookmark-input" 
          placeholder="Bookmark Name (e.g. Favorite Quote)" 
          value={newBookmarkName}
          onChange={e => setNewBookmarkName(e.target.value)}
          required
        />
        <textarea 
          className="bookmark-textarea" 
          placeholder="Add a note..." 
          value={newBookmarkNote}
          onChange={e => setNewBookmarkNote(e.target.value)}
        />
        <button type="submit" className="counter" style={{ width: '100%' }}>+ Save Current Page</button>
      </form>

      <div>
        {bookmarks.length === 0 ? (
          <p style={{ color: 'var(--text)', fontSize: '14px' }}>No bookmarks saved yet.</p>
        ) : (
          bookmarks.map(b => (
            <div key={b.id} className="bookmark-item" onClick={() => onJumpToBookmark(b)}>
              <p className="bookmark-item-title">{b.name}</p>
              {b.note && <p className="bookmark-item-note">"{b.note}"</p>}
              <p className="bookmark-item-loc">{b.chapterTitle} • {Math.round(b.progress * 100)}%</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}