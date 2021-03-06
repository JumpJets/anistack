// Load process variables
var dotenv = require('dotenv');
dotenv.load();

if (process.env.NODE_ENV === 'development') {
	var cluster = require('cluster');
	if (cluster.isMaster) {
		var cpuCores = require('os').cpus().length;
		for (var i = 0; i < cpuCores; i++) {
			cluster.fork();
		}
		return false;
	}
}

// Main application modules
var express = require('express');
var http = require('http');
var path = require('path');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var flash = require('connect-flash');
var cors = require('cors');
var lusca = require('lusca');

// Authentication modules
var passport = require('passport');
var passportLocal = require('passport-local');
var MongoStore = require('connect-mongo')(session);

// Express configuration
var app = express();
var apiRouter = express.Router();

app.disable('x-powered-by');

// Set application port
app.set('port', process.env.APP_PORT);

// Set views directory
app.set('views', path.join(__dirname, 'views'));

// Set view engine
app.set('view engine', 'hbs');

// Set public directory (static assets)
app.use(express.static(path.join(__dirname, 'public')));

// Enable POS/GET/PUT/DELETE methods
app.use(methodOverride());

// Accept JSON data
app.use(bodyParser.json());

// Accept url encoded data
app.use(bodyParser.urlencoded({
	extended: true
}));

// Parse cookies and populate req.cookies with them
app.use(cookieParser());

// Set up session storage
app.use(session({
	name: 'nothingimportant.pls.don.hijack',
	secret: process.env.SESSION_SECRET,
	store: new MongoStore({
		db: process.env.DB_NAME,
		port: process.env.DB_PORT,
		username: process.env.DB_USERNAME,
		password: process.env.DB_PASSWORD,
		auto_reconnect: true,
		clear_interval: 60 // One minute
	}),
	cookie: {
		httpOnly: true,
		maxAge: 1000 * 2630000 * 5 // 5 months
	},
	resave: true,
	saveUninitialized: true
}));

// Enable CSRF protection. Has to come after cookies/session
app.use(lusca({
    csrf: (process.env.NODE_ENV === 'production'),
	csp: false,
	xframe: 'DENY', // or SAMEORIGIN
	p3p: false,
	hsts: { maxAge: 31536000, includeSubDomains: true },
	xssProtection: true
}));

// Enable flashes
app.use(flash());

// Initialize authentication module (passport)
app.use(passport.initialize());
app.use(passport.session());

// Enable logging
if (process.env.NODE_ENV === 'development') {
	var morgan = require('morgan');
	app.use(morgan('dev'));
	process.send({cmd: 'NODE_DEV', required: '/views/stacks.hbs'});
}

// Production settings
if (process.env.NODE_ENV === 'production') {
	console.log('✓ Enabled trust proxy. Now accepting X-Forwarded-* headers.');
	app.enable('trust proxy');
	cluster.on('exit', function(worker) {
		console.log('Worker ' + worker.id + ' died');
		cluster.fork();
	});
}

// Populate res.locals.user with user information if logged in
app.use(function(req, res, next) {
	if (req.isAuthenticated()) {
		res.locals.user = req.user
	} else {
		res.locals.user = null;
	}
	next();
});

// Run helpers
require('./helpers/hbs')('./views/partials');
require('./helpers/passport');

// Web routes
require('./routes/web/index.js')(app);
require('./routes/web/list.js')(app);
require('./routes/web/stack.js')(app);	
require('./routes/web/search.js')(app);
require('./routes/web/logreg.js')(app);
require('./routes/web/settings.js')(app);
require('./routes/web/series.js')(app);

// API routes
app.use('/api', cors()); // Enable cors on all /api/* routes
app.use('/api', apiRouter); // Prepends /api/* to all routes
require('./routes/api/list.js')(apiRouter);
require('./routes/api/stacks.js')(apiRouter);
require('./routes/api/settings.js')(apiRouter);
require('./routes/api/series.js')(apiRouter);
require('./routes/api/user.js')(apiRouter);


// Basic error handling
app.use(function(err, req, res, next) {
	if (err) {
		if (process.env.NODE_ENV !== 'production') {
			console.log(req.url);
			console.log(err.stack);
		}
		res.status(500).json({ status: 'error', message: err.message });
	} else {
		next();
	}
});

// If none of the routes are matched, give 'em the 404
app.use(function(req, res, next) {
	res.status(404).send('404 - Page not found');
});

// Create application server
http.createServer(app).listen(app.get('port'), function() {
	if (process.env.NODE_ENV !== 'test') {
		console.log('✓ Running application in: ' + process.env.NODE_ENV);
		console.log('✓ Application up and running at port: ' + app.get('port'));
	}
});

module.exports = app;