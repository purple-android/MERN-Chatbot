// upload.js
// This middleware handles receiving uploaded files from the frontend.
// It uses the 'multer' library to read the file out of the HTTP request.

const path = require('path');
const multer = require('multer');

const storage = multer.memoryStorage();

const upload = multer({

  storage,

  // Set the maximum allowed file size to 10 megabytes
  // 10 * 1024 * 1024 = 10,485,760 bytes = 10MB
  limits: { fileSize: 10 * 1024 * 1024 },

  fileFilter: (req, file, cb) => {


    const ext = path.extname(file.originalname).toLowerCase();

    // The list of file extensions we support
    const allowed = ['.txt', '.pdf', '.doc', '.docx'];

    // Check if the uploaded file's extension is in our allowed list
    if (allowed.includes(ext)) {
      // null = no error, true = accept this file
      cb(null, true);
    } else {
      cb(new Error('Only .txt, .pdf, .doc, and .docx files are supported'));
    }
  }
});

module.exports = upload;