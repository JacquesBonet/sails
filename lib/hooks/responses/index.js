/**
 * Dependencies
 */
var _ = require('lodash')
	, util = require('util')
	, Err = require('../../../errors/fatal')
	, onRoute = require('./onRoute')
	, STRINGFILE = require('sails-stringfile');


/**
 * Expose hook definition
 */

module.exports = function(sails) {

	return {

		defaults: {},
		configure: function () {

			// Legacy (< v0.10) support for configured handlers
			if ( typeof sails.config[500] === 'function' ) {
				sails.after('lifted', function () {
					STRINGFILE.logDeprecationNotice('sails.config[500]',
						STRINGFILE.get('links.docs.migrationGuide.responses'),
						sails.log.debug);
					sails.log.debug('sails.config[500] (i.e. `config/500.js`) has been superceded in Sails v0.10.');
					sails.log.debug('Please define a "response" instead. (i.e. api/responses/serverError.js)');
					sails.log.debug('Your old handler is being ignored. (the format has been upgraded in v0.10)');
				});
			}
			if ( typeof sails.config[404] === 'function' ) {
				sails.after('lifted', function () {
					STRINGFILE.logDeprecationNotice('sails.config[404]',
						STRINGFILE.get('links.docs.migrationGuide.responses'),
						sails.log.debug);
					sails.log.debug('Please define a "response" instead. (i.e. api/responses/notFound.js)');
					sails.log.debug('Your old handler is being ignored. (the format has been upgraded in v0.10)');
				});
			}
		},
		


		/**
		 * When this hook is loaded...
		 */
		
		initialize: function(cb) {
			
			// Register route syntax that allows explicit routes
			// to be bound directly to custom responses by name.
			// (e.g. {response: 'foo'})
			sails.on('route:typeUnknown', onRoute(sails));

			cb();
		},



		/**
		 * Fetch relevant modules, exposing them on `sails` subglobal if necessary,
		 */
		loadModules: function (cb) {
			var hook = this;

			sails.log.verbose('Loading runtime custom response definitions...');
			sails.modules.loadResponses(function loadedRuntimeErrorModules (err, responseDefs) {
				if (err) return cb(err);

				// Check that the user reserved response methods/properties
				var reservedResKeys = [
					'view',
					'status', 'set', 'get', 'cookie', 'clearCookie', 'redirect',
					'location', 'charset', 'send', 'json', 'jsonp', 'type', 'format',
					'attachment', 'sendfile', 'download', 'links', 'locals', 'render'
				];

				_.each(Object.keys(responseDefs), function (userResponseKey) {
					if (_.contains(reservedResKeys, userResponseKey)) {
						return Err.invalidCustomResponse(userResponseKey);
					}
				});


				// Ensure that required custom responses exist.
				_.defaults(responseDefs, {
					notFound: cannotFindResponseError('notFound'),
					serverError: cannotFindResponseError('serverError'),
					forbidden: cannotFindResponseError('forbidden'),
					badRequest: cannotFindResponseError('badRequest')
				});
				
				// Register blueprint actions as middleware
				hook.middleware = responseDefs;

				return cb();
			});


			
			function cannotFindResponseError (responseName) {
				return function _mockCustomResponse () {
					var req = this.req;
					var res = this.res;

					var warningMsg = 'Cannot run `res.%s()`- the `%s` module is missing.';
					warningMsg = util.format(warningMsg, responseName, responseName);
					var helpMsg = 'You can probably solve this by creating `%s.js` in:';
					helpMsg = util.format(helpMsg, responseName);

					sails.log.error(warningMsg);
					sails.log.error(helpMsg);
					sails.log.error(sails.config.paths.responses);

					if (process.env.NODE_ENV === 'production') {
						return res.send(500);
					}
					return res.send(500, warningMsg);
				};
			}
		},




		/**
		 * Shadow route bindings
		 * @type {Object}
		 */
		routes: {
			before: {

				/**
				 * Add custom response methods to `res`.
				 * 
				 * @param {Request} req
				 * @param {Response} res
				 * @param  {Function} next [description]
				 * @api private
				 */
				'/*': function (req, res, next) {

					_.each(sails.middleware.responses, function eachMethod(responseFn, name) {
						
						// Attach custom response to `res` object
						// Provide access to `req` and `res` in `this` context.
						res[name] = _.bind(responseFn, { req: req, res: res });
					});

					// Proceed!
					next();
				}
			}
		}

	};
};

// Note for later
// We could differentiate between 500 (generic error message)
// and 504 (gateway did not receive response from upstream server) which could describe an IO problem
// This is worth having a think about, since there are 2 fundamentally different kinds of "server errors":
// (a) An infrastructural issue, or 504  (e.g. MySQL database randomly crashed or Twitter is down)
// (b) Unexpected bug in app code, or 500 (e.g. `req.session.user.id`, but `req.session.user` doesn't exist)


