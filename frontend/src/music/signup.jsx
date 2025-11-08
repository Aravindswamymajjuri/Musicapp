import React, { useState } from 'react';

const Signup = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('https://musicapp-7dy9.onrender.com/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Signup failed');
        setLoading(false);
        return;
      }

      // Store token and username
      // In your actual app with React Router, use:
      // localStorage.setItem('token', data.token);
      // localStorage.setItem('username', data.user.username);
      // window.dispatchEvent(new Event('auth-change'));
      // navigate('/songmanager');

      alert(`Welcome, ${data.user.username}! Redirecting to login...`);
      
      // Simulate redirect
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);

    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .signup-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }

        .signup-card {
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          padding: 40px;
          width: 100%;
          max-width: 450px;
          animation: slideUp 0.5s ease-out;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .signup-header {
          text-align: center;
          margin-bottom: 35px;
        }

        .signup-title {
          font-size: 32px;
          font-weight: 700;
          color: #333;
          margin: 0 0 10px 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .signup-subtitle {
          color: #666;
          font-size: 14px;
          margin: 0;
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
        }

        .form-input {
          width: 100%;
          padding: 14px 16px;
          font-size: 15px;
          border: 2px solid #e1e8ed;
          border-radius: 10px;
          transition: all 0.3s ease;
          box-sizing: border-box;
          font-family: inherit;
        }

        .form-input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
        }

        .form-input:hover {
          border-color: #c5d0e0;
        }

        .error-message {
          background: #fee;
          color: #c33;
          padding: 12px 16px;
          border-radius: 10px;
          font-size: 14px;
          margin-bottom: 20px;
          border-left: 4px solid #c33;
          animation: shake 0.4s ease;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }

        .signup-button {
          width: 100%;
          padding: 14px;
          font-size: 16px;
          font-weight: 600;
          color: white;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }

        .signup-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
        }

        .signup-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .signup-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          margin-right: 8px;
          vertical-align: middle;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .signup-footer {
          text-align: center;
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid #e1e8ed;
        }

        .signup-footer-text {
          color: #666;
          font-size: 14px;
          margin: 0;
        }

        .signup-footer-link {
          color: #667eea;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
          transition: color 0.3s ease;
        }

        .signup-footer-link:hover {
          color: #764ba2;
          text-decoration: underline;
        }

        .password-strength {
          margin-top: 8px;
          font-size: 12px;
        }

        .strength-bar {
          height: 4px;
          background: #e1e8ed;
          border-radius: 2px;
          margin-top: 6px;
          overflow: hidden;
        }

        .strength-fill {
          height: 100%;
          transition: all 0.3s ease;
          border-radius: 2px;
        }

        .strength-weak {
          width: 33%;
          background: #f5576c;
        }

        .strength-medium {
          width: 66%;
          background: #f093fb;
        }

        .strength-strong {
          width: 100%;
          background: #52c41a;
        }

        /* Responsive Design */
        @media (max-width: 480px) {
          .signup-card {
            padding: 30px 25px;
          }

          .signup-title {
            font-size: 28px;
          }

          .form-input {
            padding: 12px 14px;
            font-size: 14px;
          }

          .signup-button {
            padding: 12px;
            font-size: 15px;
          }
        }
      `}</style>

      <div className="signup-container">
        <div className="signup-card">
          <div className="signup-header">
            <h2 className="signup-title">Create Account</h2>
            <p className="signup-subtitle">Join us and start your music journey</p>
          </div>

          <div>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                required
                onKeyPress={(e) => e.key === 'Enter' && handleSignup(e)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                onKeyPress={(e) => e.key === 'Enter' && handleSignup(e)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                required
                onKeyPress={(e) => e.key === 'Enter' && handleSignup(e)}
              />
              {password && (
                <div className="password-strength">
                  <div className="strength-bar">
                    <div className={`strength-fill ${
                      password.length < 6 ? 'strength-weak' : 
                      password.length < 10 ? 'strength-medium' : 
                      'strength-strong'
                    }`}></div>
                  </div>
                </div>
              )}
            </div>

            {error && <div className="error-message">{error}</div>}

            <button 
              type="button" 
              className="signup-button" 
              disabled={loading}
              onClick={handleSignup}
            >
              {loading && <span className="spinner"></span>}
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </div>

          <div className="signup-footer">
            <p className="signup-footer-text">
              Already have an account?{' '}
              <span className="signup-footer-link" onClick={() => window.location.href = '/login'}>
                Login here
              </span>
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Signup;