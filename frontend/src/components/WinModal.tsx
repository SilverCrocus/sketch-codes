import React from 'react';

interface WinModalProps {
  isOpen: boolean;
  onClose: () => void;
  // winnerName prop is no longer needed for a team win message
}

const WinModal: React.FC<WinModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const modalStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'white',
    padding: '30px 50px',
    borderRadius: '10px',
    boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
    zIndex: 1000,
    textAlign: 'center',
  };

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 999,
  };

  const buttonStyle: React.CSSProperties = {
    marginTop: '20px',
    padding: '10px 20px',
    fontSize: '1em',
    cursor: 'pointer',
  };

  return (
    <>
      <div style={backdropStyle} onClick={onClose}></div>
      <div style={modalStyle}>
        <h2>Mission Accomplished!</h2>
        <p>Congratulations, team! You've successfully identified all your agents!</p>
        <button style={buttonStyle} onClick={onClose}>Play Again?</button> {/* Or 'Close' if no rematch logic yet */}
      </div>
    </>
  );
};

export default WinModal;
