#!/usr/bin/env node

// ##EZPAARSE

/*jslint node: true, maxlen: 180, maxerr: 50, indent: 2 */

/**
 * parser for wiley platform
 * http://analogist.couperin.org/platforms/wiley/
 */
'use strict';
var byline = require('byline');
var URL = require('url');
var querystring = require('querystring');

function parseUrl(url) {
  var result = {};
  var param  = querystring.parse(URL.parse(url).query);
  var path   = decodeURIComponent(URL.parse(url).path);

  //console.log(path);
  
  var match;

  if ((match = /\/journal\/([0-9]{2}\.[0-9]{4})\/\(ISSN\)([0-9]{4}-[0-9]{3}[0-9xX])/.exec(path)) !== null) {
    // /journal/10.1111/%28ISSN%291600-5724
    // result.doi = match[1] + "/" + "(ISSN)" + match[2];
    // result.unitid = match[2];
    result.eissn = match[2];
    result.rtype = 'TOC';
    result.mime = 'MISC';
  } else if ((match = /^\/doi\/([0-9]{2}\.[0-9]{4})\/([^.]+)\.([0-9]{4}\.[^.]+\.[^.]+)\/issuetoc$/.exec(path)) !== null) {
    // /doi/10.1111/aar.2012.83.issue-1/issuetoc
    // pid is upper case in PKB from wiley site
    // result.unitid = match[2] + '.' + match[3];
    result.pid = match[2].toUpperCase();
    result.rtype = 'TOC';
    result.mime = 'MISC';
  } else if ((match = /^\/doi\/([0-9]{2}\.[0-9]{4})\/j\.([0-9]{4}-[0-9]{3}[0-9xX])\.([0-9]{4}\.[^.]+\.[^.]+)\/abstract$/.exec(path)) !== null) {
    // /doi/10.1111/j.1600-0390.2012.00514.x/abstract
    // result.doi = match[1] + "/" + "(ISSN)" + match[2];
    // result.unitid = match[2] + '.' + match[3];
    result.eissn = match[2];
    result.rtype = 'ABS';
    result.mime = 'MISC';
  } else if ((match = /^\/doi\/([0-9]{2}\.[0-9]{4})\/([^.]+)\.([0-9]+)\/abstract$/.exec(path)) !== null) {
    // /doi/10.1002/anie.201209878/abstract
    // result.unitid = match[2] + '.' + match[3];
    result.pid = match[2].toUpperCase();
    result.rtype = 'ABS';
    result.mime = 'MISC';
  } else if ((match = /^\/doi\/([0-9]{2}\.[0-9]{4})\/([^.]+)\.([0-9]+)\/full$/.exec(path)) !== null) {
    // /doi/10.1111/acv.12024/full
    // result.unitid = match[2] + '.' + match[3];
    result.pid = match[2].toUpperCase();
    result.rtype = 'ARTICLE';
    result.mime = 'HTML';
  } else if ((match = /^\/doi\/([0-9]{2}\.[0-9]{4})\/j\.([0-9]{4}-[0-9]{3}[0-9xX])\.([0-9]{4}\.[^.]+\.[^.]+)\/pdf$/.exec(path)) !== null) {
    // /doi/10.1111/j.1600-0390.2012.00514.x/pdf
    // result.doi = match[1] + "/" + "(ISSN)" + match[2];
    // result.unitid = match[2] + '.' + match[3];
    result.eissn = match[2];
    result.rtype = 'ARTICLE';
    result.mime = 'PDF';
  } else if ((match = /^\/doi\/([0-9]{2}\.[0-9]{4})\/([^.]+)\.([0-9]+)\/pdf$/.exec(path)) !== null) {
    // /doi/10.1002/anie.201209878/pdf
    // result.unitid = match[2] + '.' + match[3];
    result.pid = match[2].toUpperCase();
    result.rtype = 'ARTICLE';
    result.mime = 'PDF';
  } else if ((match = /^\/book\/([0-9]{2}\.[0-9]{4})\/([0-9]+)$/.exec(path)) !== null) {
    // /book/10.1002/9781118268117
    // result.unitid = match[2];
    result.pid = match[2].toUpperCase();
    result.rtype = 'BOOK_SECTION';
    result.mime = 'MISC';
  } else if ((match = /^\/doi\/([0-9]{2}\.[0-9]{4})\/([0-9]+)\.([^.]+)\/pdf$/.exec(path)) !== null) {
    // /doi/10.1002/9781118268117.ch3/pdf
    // result.doi = match[1];
    // result.unitid = match[2] + '.' + match[3];
    result.pid = match[2].toUpperCase();
    result.rtype = 'BOOK_SECTION';
    result.mime = 'PDF';
  }
  return result;
}

/*
* If an array of urls is given, return an array of results
* Otherwise, read stdin and write into stdout
*/
exports.parserExecute = function (urls) {

  if (urls && Array.isArray(urls)) {
    var results = [];
    for (var i = 0, l = urls.length; i < l; i++) {
      results.push(parseUrl(urls[i]));
    }
    return results;
  } else {
    var stdin = process.stdin;
    var stdout = process.stdout;
    var stream = byline.createStream(stdin);

    stream.on('end', function () {
      process.exit(0);
    });

    stream.on('close  ', function () {
      process.exit(0);
    });

    stream.on('data', function (line) {
      stdout.write(JSON.stringify(parseUrl(line)) + '\n');
    });
  }
}

if (!module.parent) {
  var optimist = require('optimist')
    .usage('Parse URLs read from standard input. ' +
      'You can either use pipes or enter URLs manually.' +
      '\n  Usage: $0' +
      '\n  Example: cat urls.txt | $0');
  var argv = optimist.argv;

  // show usage if --help option is used
  if (argv.help || argv.h) {
    optimist.showHelp();
    process.exit(0);
  }

  exports.parserExecute();
}
