/*global describe, it*/
var express = require('express'),
    autoprefixer = require('../lib/autoprefixer');


var expect = require('unexpected').installPlugin(require('unexpected-express'));

expect.addAssertion('to be served as', function (expect, subject, value) {
    var request = (typeof subject === 'object') ? subject : {};
    var response = (typeof value === 'object') ? value : {};
    var browsers = request.browsers || 'Chrome > 30';

    if (typeof subject === 'string') { request.content = subject; }
    if (!request.url) { request.url = '/style.css'; }
    if (typeof value === 'string') { response.body = value; }

    var app = express()
        .use(autoprefixer({ browsers: browsers, cascade: false }))
        .use(function (req, res, next) {
            if (req.contentType) {
                res.contentType(req.contentType);
            }
            if (!req.contentType && /\.css$/.test(req.url)) {
                res.contentType('text/css');
            }
            res.status(200).send(req.content);
        });

    return expect(app, 'to yield exchange', {
        request: request,
        response: response
    });
});

describe('express-autoprefixer', function () {
    it('should export a function', function () {
        return expect(autoprefixer, 'to be a function');
    });
    it('should return a function when calling the exported module', function () {
        return expect(autoprefixer(), 'to be a function');
    });
    it('should not mess with request for a non-css file', function () {
        return expect({
            url: '/hello-world.txt',
            content: 'hello world'
        }, 'to be served as', 'hello world');
    });
    it('should prefix animation', function () {
        return expect(
            '.foo { animation: bar; }',
            'to be served as',
            '.foo { -webkit-animation: bar; animation: bar; }'
        );
    });
    it('should not prefix already prefixed properties', function () {
        return expect(
            '.foo { -webkit-animation: bar; animation: bar; }',
            'to be served as',
            '.foo { -webkit-animation: bar; animation: bar; }'
        );
    });
    it('should not prefix properties supported in the selected browsers', function () {
        return expect({
            content: '.foo { border-radius: 10px; }',
            browsers: 'Chrome > 30'
        }, 'to be served as', '.foo { border-radius: 10px; }');
    });
    it('should work with less files served through express-compiless', function () {
        // express-compiless will compile .less files on the fly and serve the
        // compiled content with content-type text/css on the original url.
        return expect({
            url: '/style.less',
            contentType: 'text/css',
            content: '.foo { animation: bar; }'
        }, 'to be served as', '.foo { -webkit-animation: bar; animation: bar; }');
    });
    it('should serve html without throwing errors', function () {
        return expect({
            url: '/index.html',
            contentType: 'text/html',
            content: '<!DOCTYPE html><html></html>'
        }, 'to be served as', '<!DOCTYPE html><html></html>');
    });
});
