import { useState } from 'react';
import Library from './components/Library';
import Reader from './components/Reader';
import './App.css';

function App() {
  const [currentBook, setCurrentBook] = useState(null);

  // If a book is selected, show the reader. Otherwise, show the library.
  return currentBook ? (
    <Reader book={currentBook} onBack={() => setCurrentBook(null)} />
  ) : (
    <Library onOpenBook={setCurrentBook} />
  );
}

export default App;