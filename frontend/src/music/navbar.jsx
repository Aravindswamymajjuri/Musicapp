import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const Header = ({ token, user, onLogout }) => {
  const navigate = useNavigate();

  const handleLogoutClick = () => {
    navigate('/login');
    localStorage.removeItem("token")
    localStorage.removeItem("joinedRoomCode")
  };

  return (
    <header style={styles.header}>
      <nav style={styles.nav}>
        <Link to="/songmanager" style={styles.link}>Songs</Link>
        <Link to="/favorite" style={styles.link}>Favorites</Link>
        <Link to="/room" style={styles.link}>Rooms</Link>
      </nav>

      <div>
        {localStorage.getItem("token") && user ? (
          <>
            <span style={styles.userInfo}>Hello, {user.username || user.email}</span>
            <button onClick={handleLogoutClick} style={styles.button}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login" style={styles.link}>Login</Link>
             <Link to="/login" onClick={handleLogoutClick} style={styles.link}>Logout</Link>
            <Link to="/signup" style={styles.link}>Signup</Link>
          </>
        )}
      </div>
    </header>
  );
}

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 20px',
    backgroundColor: '#282c34',
    color: 'white',
  },
  nav: {
    display: 'flex',
    gap: '20px',
  },
  link: {
    color: 'white',
    textDecoration: 'none',
    fontWeight: 'bold',
  },
  userInfo: {
    marginRight: '15px',
  },
  button: {
    backgroundColor: '#ff4d4f',
    border: 'none',
    color: 'white',
    padding: '6px 12px',
    borderRadius: 4,
    cursor: 'pointer',
  }
};

export default Header;
