CREATE TABLE IF NOT EXISTS questions(repo TEXT NOT NULL, key TEXT NOT NULL, project TEXT, issue INTEGER, gates TEXT, text_he TEXT, options TEXT, recommended TEXT, asked_at INTEGER, answer TEXT, answered_at INTEGER, via TEXT, PRIMARY KEY(repo,key));
CREATE TABLE IF NOT EXISTS notices(id INTEGER PRIMARY KEY AUTOINCREMENT, repo TEXT, project TEXT, at INTEGER, text_he TEXT, issue INTEGER);
