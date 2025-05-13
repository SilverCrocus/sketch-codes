import React, { useState, useEffect } from 'react';

interface WordGridProps {
  // We can add props later if needed, e.g., onWordClick
}

const WordGrid: React.FC<WordGridProps> = () => {
  const [words, setWords] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWords = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/words'); // FastAPI serves on the same host/port
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setWords(data);
        setError(null);
      } catch (e) {
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError('An unknown error occurred');
        }
        console.error("Failed to fetch words:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchWords();
  }, []); // Empty dependency array means this effect runs once on mount

  const handleWordClick = (word: string, index: number) => {
    console.log(`Clicked word: ${word} at index: ${index}`);
    // Later, this will send a GUESS message via WebSocket
  };

  if (loading) {
    return <div style={styles.loadingText}>Loading words...</div>;
  }

  if (error) {
    return <div style={styles.errorText}>Error loading words: {error}. Is the backend server running?</div>;
  }

  if (words.length === 0) {
    return <div style={styles.loadingText}>No words loaded. Make sure the backend is providing words.</div>;
  }

  return (
    <div style={styles.gridContainer}>
      {words.map((word, index) => (
        <button
          key={index}
          style={styles.gridTile}
          onClick={() => handleWordClick(word, index)}
        >
          {word}
        </button>
      ))}
    </div>
  );
};

// Basic styling - can be moved to a CSS file later
const styles: { [key: string]: React.CSSProperties } = {
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gridTemplateRows: 'repeat(5, 1fr)',
    gap: '10px',
    width: 'calc(5 * 100px + 4 * 10px)', // 5 tiles of 100px + 4 gaps of 10px
    height: 'calc(5 * 60px + 4 * 10px)', // 5 tiles of 60px + 4 gaps of 10px
    margin: '20px auto',
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    backgroundColor: '#f0f0f0',
  },
  gridTile: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '4px',
    padding: '10px',
    fontSize: '1em',
    cursor: 'pointer',
    textAlign: 'center',
    minHeight: '60px', // Ensure tiles have a minimum height
    boxSizing: 'border-box',
    wordBreak: 'break-word',
  },
  loadingText: {
    textAlign: 'center',
    fontSize: '1.2em',
    padding: '20px',
  },
  errorText: {
    textAlign: 'center',
    fontSize: '1.2em',
    padding: '20px',
    color: 'red',
  }
};

export default WordGrid;
