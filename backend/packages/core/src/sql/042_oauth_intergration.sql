-- Table for OAuth sessions
CREATE TABLE oauth_sessions (
    session_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    secret_code VARCHAR(64) NOT NULL,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table for which OAuth apps each session has access to
CREATE TABLE oauth_session_apps (
    session_id INT NOT NULL,
    app_id VARCHAR(50) NOT NULL,
    PRIMARY KEY (session_id, app_id),
    FOREIGN KEY (session_id) REFERENCES oauth_sessions(session_id) ON DELETE CASCADE
);
