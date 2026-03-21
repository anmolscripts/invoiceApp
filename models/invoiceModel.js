const db = require('./db');

exports.getAllGst = (callback) => {
    db.all('SELECT * FROM Gst ORDER BY GST_ID DESC', [], (err, rows) => {
        if (err) {
            console.error(err);
            return callback([]);
        }
        callback(rows);
    });
};

exports.addNote = (text, callback) => {
    db.run('INSERT INTO notes (text) VALUES (?)', [text], function (err) {
        callback(err, { id: this.lastID, text });
    });
};

exports.deleteNote = (id, callback) => {
    db.run('DELETE FROM notes WHERE id = ?', [id], callback);
};

exports.searchItems = (search, callback) => {
    const query = `
        SELECT * FROM item 
        WHERE item_name LIKE ?
        ORDER BY id DESC
    `;

    db.all(query, [`%${search}%`], callback);
};