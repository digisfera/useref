/* jshint node: true */
/* global describe, it */
'use strict';
var expect = require('chai').expect;
var fs = require('fs');
var path = require('path');
var useRef = require('../src/index');

function djoin(p) {
  return path.normalize(path.join(__dirname, p));
}
function fread(f) {
  return fs.readFileSync(f, { encoding: 'utf-8'});
}


describe('html-ref-replace', function() {

  it('should replace reference in css block and return replaced files', function() {
    var result = useRef(fread(djoin('testfiles/01.html')));
    expect(result[0]).to.equal(fread(djoin('testfiles/01-expected.html')));
    expect(result[1]).to.eql({ css: { '/css/combined.css': { 'assets': [ '/css/one.css', '/css/two.css' ] }}});
  });


  it('should replace reference in js block and return replaced files', function() {
    var result = useRef(fread(djoin('testfiles/02.html')));
    expect(result[0]).to.equal(fread(djoin('testfiles/02-expected.html')));
    expect(result[1]).to.eql({ js: { 'scripts/combined.concat.min.js': { 'assets': [ 'scripts/this.js', 'scripts/that.js' ] }}});
  });

  it('should handle comments and whitespace in blocks', function() {
    var result = useRef(fread(djoin('testfiles/03.html')));
    expect(result[0]).to.equal(fread(djoin('testfiles/03-expected.html')));
    expect(result[1]).to.eql({ js: { 'scripts/combined.concat.min.js': { 'assets': [ 'scripts/this.js', 'scripts/that.js' ] }}});
  });

  it('should handle multiple blocks', function() {
    var result = useRef(fread(djoin('testfiles/04.html')));
    expect(result[0]).to.equal(fread(djoin('testfiles/04-expected.html')));
    expect(result[1]).to.eql({
      js: {
        'scripts/combined.concat.min.js': { 'assets': [ 'scripts/this.js', 'scripts/that.js' ] },
        'scripts/combined2.concat.min.js': { 'assets': [ 'scripts/anotherone.js', 'scripts/yetonemore.js' ] }
      },
      css: {
        '/css/combined.css': { 'assets': [ '/css/one.css', '/css/two.css' ] },
        '/css/combined2.css': { 'assets': [ '/css/three.css', '/css/four.css' ] }
      }
    });
  });

  it('should return the alternate search path in css block', function() {
    var result = useRef(fread(djoin('testfiles/05.html')));
    expect(result[1].css['/css/combined.css'].searchPaths).to.equal('.tmp');
  });

  it('should return the alternate search path in js block', function() {
    var result = useRef(fread(djoin('testfiles/06.html')));
    expect(result[1].js['scripts/combined.concat.min.js'].searchPaths).to.equal('{.tmp,app}');
  });
});