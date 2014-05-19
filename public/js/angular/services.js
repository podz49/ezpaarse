'use strict';

/* Services */

angular.module('ezPAARSE.services', [])
  .service('userService', function () {
    function userService() {
      this.user = { logged: false };
    };

    userService.prototype.login = function (name, group) {
      this.user.name   = name;
      this.user.group  = group;
      this.user.logged = true;
    };

    userService.prototype.logout = function () {
      this.user.logged = false;
    };

    userService.prototype.hasAccess = function () {
      if (!this.user || !this.user.group || arguments.length === 0) {
        return false;
      }

      return (Array.prototype.indexOf.call(arguments, this.user.group) !== -1);
    };

    userService.prototype.isAuthenticated = function () {
      return this.user.logged;
    };

    return new userService();
  }).service('requestService', function ($rootScope, socket) {
    function requestService() {
      var self  = this;
      this.history  = [];
      this.baseData = {
        state: 'idle',
        progress: 0,
        logs: [],
        report: {},
        rejects: [
          { cat: 'general', key: 'nb-denied-ecs',            percent: 0, title: 'rejects+denied_ecs' },
          { cat: 'rejets',  key: 'nb-lines-duplicate-ecs',   percent: 0, title: 'rejects+duplicates' },
          { cat: 'rejets',  key: 'nb-lines-unordered-ecs',   percent: 0, title: 'rejects+chrono_anomalies' },
          { cat: 'rejets',  key: 'nb-lines-ignored-domains', percent: 0, title: 'rejects+ignored_domains' },
          { cat: 'rejets',  key: 'nb-lines-unknown-domains', percent: 0, title: 'rejects+unknown_domains' },
          { cat: 'rejets',  key: 'nb-lines-unknown-format',  percent: 0, title: 'rejects+unknown_formats' },
          { cat: 'rejets',  key: 'nb-lines-unqualified-ecs', percent: 0, title: 'rejects+unqualified_ecs' },
          { cat: 'rejets',  key: 'nb-lines-pkb-miss-ecs',    percent: 0, title: 'rejects+missing_pkbs' }
        ]
      };
      this.data = angular.copy(this.baseData);

      /**
       * Give socket ID to the request service
       */
      socket.on('connected', function (socketID) {
        self.socketID = socketID;
      });

      this.loggingListener = function (log) {
        self.data.logs.push(log);
      };

      this.reportListener = function (report) {
        self.data.report = report;

        self.data.nbLines = report.general['nb-lines-input'] - report.rejets['nb-lines-ignored'];
        if (!self.data.nbLines) { self.data.nbLines = 0; return; }

        self.data.rejects.forEach(function (reject) {
          reject.number  = report[reject.cat][reject.key];
          reject.percent = (reject.number / self.data.nbLines) * 100;

          if (reject.number === 0) {
            report[reject.cat][reject.key.replace(/^nb(?:-lines)?/, 'url')] = '';
          }
        });
      };
    };

    requestService.prototype.cleanHistory = function () {
      this.history = [];
    };

    /**
     * Set state to idle, clean current request data and stop listening to socket events
     */
    requestService.prototype.reset = function () {
      socket.removeListener('report', this.reportListener);
      socket.removeListener('logging', this.loggingListener);

      this.data = angular.copy(this.baseData);
    };

    requestService.prototype.isLoading = function () {
      return (this.data.state == 'loading' || this.data.state == 'finalisation');
    };

    requestService.prototype.abort = function (callback) {
      callback = callback || function () {};
      var self = this;

      if (this.xhr) {
        // Workaround : call function out of angular context
        setTimeout(function () {
          self.xhr.abort();
          callback();
        });
      }
    };

    requestService.prototype.send = function (formData, headers) {
      if (this.data.state == 'loading') { return false; }

      this.reset();
      var self               = this;
      this.data.jobID        = uuid.v1();
      this.data.state        = 'loading';
      this.data.errorMessage = '';

      headers = headers || {};
      headers['Socket-ID'] = this.socketID;

      var currentJob = {
        id: this.data.jobID,
        date: new Date()
      };

      socket.on('logging', this.loggingListener);
      socket.on('report', this.reportListener);

      this.xhr = $.ajax({
        headers:     headers || {},
        type:        'POST',
        url:         '/' + this.data.jobID + '?_method=PUT',
        // dataType:    'html',
        data:        formData,
        cache:       false,
        contentType: false,
        processData: false,
        xhr: function () {
          var myXhr = $.ajaxSettings.xhr();
          if (myXhr.upload) {
            myXhr.upload.addEventListener('progress', function (e) {
              if (e.lengthComputable) {
                $rootScope.$apply(function () {
                  self.data.progress = ((e.loaded * 100) / e.total).toFixed(1);
                });
              }
            });
            myXhr.upload.addEventListener('load', function (e) {
              $rootScope.$apply(function () {
                self.data.progress = 100;
                self.data.state    = 'finalisation';
              });
            });
          }
          return myXhr;
        },
        complete: function () {
          self.xhr = null;
          $rootScope.$apply(function () {
            self.history.push(currentJob);
          });
        },
        success: function (data) {
          $rootScope.$apply(function () {
            self.data.state = 'success';
          });
        },
        error: function (jqXHR, textStatus, errorThrown) {
          $rootScope.$apply(function () {
            if (textStatus == 'abort') {
              self.data.state = 'aborted';
              return;
            }

            var errorCode    = jqXHR.getResponseHeader("ezPAARSE-Status");
            var errorMessage = jqXHR.getResponseHeader("ezPAARSE-Status-Message");

            if (errorCode && errorMessage) {
              self.data.errorMessage = errorCode + ' : ' + errorMessage;
            } else {
              self.data.errorMessage = 'Une erreur est survenue';
            }

            self.data.state = 'error';
          });
        }
      });

      return true;
    };

    return new requestService();
  })
  .service('inputService', function ($cookieStore, $http) {
    function inputService() {
      this.files    = [];
      this.text     = '';
      this.autoSort = true;
    }

    inputService.prototype.clear = function () {
      this.files = [];
      this.text  = '';
    };

    inputService.prototype.updateTotalSize = function () {
      this.totalSize = 0;
      for (var i = this.files.length - 1; i >= 0; i--) {
        this.totalSize += this.files[i].size;
      }
    };

    inputService.prototype.sortFiles = function (file) {
      if (this.autoSort) {
        this.files.sort(function (f1, f2) {
          return (f1.name.toLowerCase() > f2.name.toLowerCase() ? 1 : -1);
        });
      }
    };

    inputService.prototype.addFile = function (file) {
      if (file) {
        this.files.push(file);
        this.updateTotalSize();
        this.sortFiles();
      }
    };

    inputService.prototype.removeFile = function (filename) {
      for (var i = this.files.length - 1; i >= 0; i--) {
        if (this.files[i].name == filename) {
          this.files.splice(i, 1);
          this.updateTotalSize();
          return;
        }
      }
    };

    return new inputService();
  })
  .service('settingService', function ($cookieStore, $http) {
    function settingService() {
      var self = this;

      this.selections = {
        proxyTypes: [
          'EZproxy',
          'Apache',
          'Squid'
        ],
        resultFormats: [
          { type: 'CSV',  mime: 'text/csv' },
          { type: 'TSV',  mime: 'text/tab-separated-values' },
          { type: 'JSON', mime: 'application/json' }
        ],
        tracesLevels: [
          { level: 'error',   desc: 'Erreurs uniquement' },
          { level: 'warn',    desc: 'Warnings sans conséquences' },
          { level: 'info',    desc: 'Informations générales' },
          { level: 'verbose', desc: '-- vraiment nécessaire? --' }
        ]
      };

      this.remember = true;
      this.defaults = {
        outputFields: { plus: [], minus: [] },
        customHeaders: [],
        headers: {
          'Accept':          'text/csv',
          'Traces-Level':    'info',
          'Date-Format':     '',
          'Relative-Domain': ''
        }
      };

      this.settings = angular.copy(this.defaults);
      this._control = angular.copy(this.defaults);
      this.loadSavedSettings();

      $http.get('/info/form-predefined')
        .success(function (data) {
          self.predefined = data;

          if (data[self.settingsType]) {
            var settings = self.getSettingsFrom(self.settingsType);
            if (settings) {
              self._control = settings;
              self.control();
            }
          }
        })
        .error(function () {
          self.predefined = {};
        });
    };

    /**
     * Check that current settings match the control object
     */
    settingService.prototype.control = function () {
      this.custom = !angular.equals(this.settings, this._control);
    };

    /**
     * Returns settings as a list of headers for a request
     */
    settingService.prototype.getHeaders = function () {
      var settings = this.settings;
      var headers  = angular.copy(settings.headers);

      if (settings.proxyType && settings.logFormat) {
        headers['Log-Format-' + settings.proxyType] = settings.logFormat;
      }

      // Create Output-Fields headers
      if (settings.outputFields) {
        var outputFields = '';

        if (settings.outputFields.plus && settings.outputFields.plus.length) {
          settings.outputFields.plus.forEach(function (field) {
            outputFields += '+' + field + ',';
          });
        }

        if (settings.outputFields.minus && settings.outputFields.minus.length) {
          settings.outputFields.minus.forEach(function (field) {
            outputFields += '-' + field + ',';
          });
        }

        headers['Output-Fields'] = outputFields.substr(0, outputFields.length - 1);
      }

      if (settings.customHeaders && settings.customHeaders.length) {
        settings.customHeaders.forEach(function (header) {
          if (header.name && header.value) { headers[header.name] = header.value; }
        });
      }

      return headers;
    };

    /**
     * Add an output field
     * @param {String} name name of the field
     * @param {String} type plus or minus
     */
    settingService.prototype.addOutputField = function (name, type) {
      if (type == 'plus' || type == 'minus') {
        this.settings.outputFields[type].push(name);
      }
    };
    /**
     * Remove an output field
     * @param  {Integer} index index in the array
     */
    settingService.prototype.removeOutputField = function (name, type) {
      if (type == 'plus' || type == 'minus') {
        var index = this.settings.outputFields[type].indexOf('name');
        if (index) {
          this.settings.outputFields[type].splice(index, 1);
        }
      }
    };

    /**
     * Add a custom header
     * @param {String} name  header name
     * @param {String} value header value
     */
    settingService.prototype.addCustomHeader = function (name, value) {
      if (!this.settings.customHeaders) {
        this.settings.customHeaders = [];
      }
      this.settings.customHeaders.push({ name: name, value: value });
    };
    /**
     * Remove a custom header
     * @param {Integer} index index in the array
     */
    settingService.prototype.removeCustomHeader = function (index) {
      this.settings.customHeaders.splice(index, 1);
    };

    /**
     * Reset settings to default
     */
    settingService.prototype.loadDefault = function () {
      this.settings     = angular.copy(this.defaults);
      this._control     = angular.copy(this.defaults);
      this.custom       = false;
      this.settingsType = undefined;
      this.saveSettings();
    };

    /**
     * Get settings from a predefined object
     * @param  {String} type predefined setting key
     * @return {Object}      settings
     */
    settingService.prototype.getSettingsFrom = function (type) {
      var headers  = this.predefined[type];
      if (!headers) { return; }

      var settings = angular.copy(this.defaults);
      headers      = angular.copy(this.predefined[type]);

      if (headers['Output-Fields']) {
        var fields = headers['Output-Fields'].split(',');
        fields.forEach(function (field) {
          field = field.trim();

          if (field) {
            var type = field.charAt(0) == '+' ? 'plus' : 'minus';
            settings.outputFields[type].push(field.substr(1));
          }
        });

        delete headers['Output-Fields'];
      }

      for (var name in headers) {
        if (this.defaults.headers[name] !== undefined) {
          settings.headers[name] = headers[name];

        } else if (/^Log-Type$/i.test(name)) {
          settings.proxyType = headers[name];

        } else if (/^Log-Format$/i.test(name)) {
          settings.logFormat = headers[name];

        } else {
          settings.customHeaders.push({ name: name, value: headers[name] });
        }
      }

      return settings;
    };

    /**
     * Load settings from a predefined object
     * @param  {String} type predefined setting key
     */
    settingService.prototype.defineSettings = function (type) {
      this.settings = angular.copy(this.defaults);
      if (!type) {
        this.settingsType = undefined;
      }
      var settings = this.getSettingsFrom(type);

      if (settings) {
        this.settings     = settings;
        this.settingsType = type;
      }

      this._control = angular.copy(settings || this.defaults);
    };

    /**
     * Load ookies and overwrite current settings
     */
    settingService.prototype.loadSavedSettings = function () {

      this.remember     = $cookieStore.get('remember');
      this.settingsType = $cookieStore.get('settingsType');
      var settings      = $cookieStore.get('settings');
      if (!settings) { return; }

      for (var opt in settings) {
        this.settings[opt] = settings[opt];
      }
    };

    /**
     * Save current remember setting to cookies and save or reset settings
     */
    settingService.prototype.saveRemember = function () {
      $cookieStore.put('remember', this.remember);
      this.saveSettings();
    };

    /**
     * Save or reset settings depending to remember boolean
     */
    settingService.prototype.saveSettings = function () {
      if (this.remember) {
        if (this.settings)     { $cookieStore.put('settings', this.settings); }
        if (this.settingsType) { $cookieStore.put('settingsType', this.settingsType); }
      } else {
        $cookieStore.remove('settings');
        $cookieStore.remove('settingsType');
      }
    };

    return new settingService();
  })
  .factory('socket', function (socketFactory) {
    return socketFactory();
  });