const path = require('path');

process.env.COMPILED = path.join(process.cwd(), '.tsout');
require('./pdf_spec.test.js');
