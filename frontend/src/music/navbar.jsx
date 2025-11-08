import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const navigate = useNavigate();

  // Check login status on mount and when localStorage changes
  useEffect(() => {
    const checkAuth = () => {
      const username = localStorage.getItem("username");
      const token = localStorage.getItem("token");
      
      if (username && token) {
        setUser(username);
        setIsLoggedIn(true);
      } else {
        setUser(null);
        setIsLoggedIn(false);
      }
    };

    checkAuth();

    // Listen for storage changes (in case of login/logout in another tab)
    window.addEventListener('storage', checkAuth);
    
    // Custom event for same-tab updates
    window.addEventListener('auth-change', checkAuth);

    return () => {
      window.removeEventListener('storage', checkAuth);
      window.removeEventListener('auth-change', checkAuth);
    };
  }, []);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleLogoutClick = () => {
    localStorage.removeItem("joinedRoomCode");
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    
    setUser(null);
    setIsLoggedIn(false);
    setIsMenuOpen(false);
    
    // Dispatch custom event for other components
    window.dispatchEvent(new Event('auth-change'));
    
    // Navigate to login
    navigate('/login');
  };

  const handleLinkClick = () => {
    setIsMenuOpen(false);
  };

  return (
    <>
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 30px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          position: sticky;
          top: 0;
          z-index: 1000;
        }

        .header__brand {
          font-size: 24px;
          font-weight: 700;
          color: white;
          text-decoration: none;
          cursor: pointer;
        }

        .header__nav {
          display: flex;
          gap: 30px;
          align-items: center;
        }

        .header__link {
          color: white;
          text-decoration: none;
          font-weight: 600;
          font-size: 16px;
          padding: 8px 16px;
          border-radius: 6px;
          transition: all 0.3s ease;
          position: relative;
          cursor: pointer;
        }

        .header__link:hover {
          background-color: rgba(255, 255, 255, 0.15);
          transform: translateY(-2px);
        }

        .header__link::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%) scaleX(0);
          width: 80%;
          height: 2px;
          background-color: white;
          transition: transform 0.3s ease;
        }

        .header__link:hover::after {
          transform: translateX(-50%) scaleX(1);
        }

        .header__user-section {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .header__user-info {
          font-size: 15px;
          font-weight: 500;
          padding: 6px 12px;
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          backdrop-filter: blur(10px);
        }

        .header__button {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          border: none;
          color: white;
          padding: 10px 20px;
          border-radius: 25px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(245, 87, 108, 0.3);
        }

        .header__button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(245, 87, 108, 0.4);
        }

        .header__button:active {
          transform: translateY(0);
        }

        .header__hamburger {
          display: none;
          flex-direction: column;
          gap: 5px;
          cursor: pointer;
          background: none;
          border: none;
          padding: 8px;
          z-index: 1001;
        }

        .header__hamburger-line {
          width: 28px;
          height: 3px;
          background-color: white;
          border-radius: 3px;
          transition: all 0.3s ease;
        }

        .header__hamburger.active .header__hamburger-line:nth-child(1) {
          transform: rotate(45deg) translate(8px, 8px);
        }

        .header__hamburger.active .header__hamburger-line:nth-child(2) {
          opacity: 0;
        }

        .header__hamburger.active .header__hamburger-line:nth-child(3) {
          transform: rotate(-45deg) translate(8px, -8px);
        }

        .header__mobile-menu {
          display: none;
        }

        @media (max-width: 721px) {
          .header {
            padding: 15px 20px;
          }

          .header__hamburger {
            display: flex;
          }

          .header__nav,
          .header__user-section {
            display: none;
          }

          .header__mobile-menu {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            overflow-y: auto;
            padding-top: 80px;
          }

          .header__mobile-menu.open {
            transform: translateX(0);
          }

          .header__mobile-nav {
            display: flex;
            flex-direction: column;
            gap: 0;
            padding: 20px;
          }

          .header__mobile-link {
            color: white;
            text-decoration: none;
            font-weight: 600;
            font-size: 18px;
            padding: 18px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.3s ease;
            cursor: pointer;
          }

          .header__mobile-link:hover {
            background-color: rgba(255, 255, 255, 0.1);
            padding-left: 30px;
          }

          .header__mobile-user-section {
            display: flex;
            flex-direction: column;
            gap: 15px;
            padding: 30px 20px;
            border-top: 2px solid rgba(255, 255, 255, 0.2);
            margin-top: 20px;
          }

          .header__mobile-user-info {
            font-size: 16px;
            font-weight: 500;
            padding: 12px 20px;
            background-color: rgba(255, 255, 255, 0.15);
            border-radius: 12px;
            text-align: center;
          }

          .header__mobile-button {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            border: none;
            color: white;
            padding: 14px 20px;
            border-radius: 12px;
            cursor: pointer;
            font-weight: 600;
            font-size: 16px;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(245, 87, 108, 0.3);
          }

          .header__mobile-button:active {
            transform: scale(0.98);
          }
        }

        @media (min-width: 722px) and (max-width: 1024px) {
          .header {
            padding: 15px 25px;
          }

          .header__nav {
            gap: 20px;
          }

          .header__link {
            font-size: 15px;
            padding: 7px 14px;
          }

          .header__user-section {
            gap: 12px;
          }

          .header__user-info {
            font-size: 14px;
          }

          .header__button {
            padding: 9px 18px;
            font-size: 13px;
          }
        }

        @media (min-width: 722px) and (max-width: 900px) {
          .header__nav {
            gap: 15px;
          }

          .header__link {
            font-size: 14px;
            padding: 6px 12px;
          }
        }

        @media (min-width: 1400px) {
          .header {
            padding: 18px 60px;
          }

          .header__nav {
            gap: 40px;
          }

          .header__link {
            font-size: 17px;
          }

          .header__button {
            padding: 12px 24px;
            font-size: 15px;
          }
        }
      `}</style>

      <header className="header">
        <Link to="/songmanager" className="header__brand">MusicApp</Link>

        <nav className="header__nav">
          <Link to="/songmanager" className="header__link">Songs</Link>
          <Link to="/favorite" className="header__link">Favorites</Link>
          <Link to="/room" className="header__link">Rooms</Link>
        </nav>

        <div className="header__user-section">
          {isLoggedIn && user ? (
            <>
              <span className="header__user-info">
                Hello, {user}
              </span>
              <button onClick={handleLogoutClick} className="header__button">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="header__link">Login</Link>
              <Link to="/signup" className="header__link">Signup</Link>
            </>
          )}
        </div>

        <button 
          className={`header__hamburger ${isMenuOpen ? 'active' : ''}`}
          onClick={toggleMenu}
          aria-label="Toggle menu"
        >
          <span className="header__hamburger-line"></span>
          <span className="header__hamburger-line"></span>
          <span className="header__hamburger-line"></span>
        </button>

        <div className={`header__mobile-menu ${isMenuOpen ? 'open' : ''}`}>
          <nav className="header__mobile-nav">
            <Link to="/songmanager" className="header__mobile-link" onClick={handleLinkClick}>Songs</Link>
            <Link to="/favorite" className="header__mobile-link" onClick={handleLinkClick}>Favorites</Link>
            <Link to="/room" className="header__mobile-link" onClick={handleLinkClick}>Rooms</Link>
          </nav>

          <div className="header__mobile-user-section">
            {isLoggedIn && user ? (
              <>
                <div className="header__mobile-user-info">
                  Hello, {user}
                </div>
                <button onClick={handleLogoutClick} className="header__mobile-button">
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="header__mobile-link" onClick={handleLinkClick}>Login</Link>
                <Link to="/signup" className="header__mobile-link" onClick={handleLinkClick}>Signup</Link>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
};

export default Header;