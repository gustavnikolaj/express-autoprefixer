const express = require('express');
const autoprefixer = require('../lib/autoprefixer');
const expect = require('unexpected').installPlugin(
    require('unexpected-express')
);
const fixturesPath = require('path').resolve(__dirname, './fixtures');

// Css custom assertion
var mensch = require('mensch');

function parseAndPrettyPrint(cssString) {
    return mensch.stringify(mensch.parse(cssString), {indentation: '  '});
}

expect.addAssertion('<string> to contain the same CSS as <string>', function (expect, subject, value) {
    expect(parseAndPrettyPrint(subject), 'to equal', parseAndPrettyPrint(value));
});

expect.addAssertion('<string> to contain an inline source map [exhaustively] satisfying <object>', function (expect, subject, value) {
    return expect(subject, 'to match', /(?:\/\*|\/\/)# sourceMappingURL=data:application\/json;base64,([^* ]*)/).spread(function ($0, base64Str) {
        return expect(JSON.parse(new Buffer(base64Str, 'base64').toString('utf-8')), 'to [exhaustively] satisfy', value);
    });
});

expect.addAssertion('to be served as', (expect, subject, value) => {
    const request = typeof subject === 'object' ? subject : {};
    const response = typeof value === 'object' ? value : {};
    const browsers = request.browsers || 'Chrome > 30';

    if (typeof subject === 'string') {
        request.content = subject;
    }
    if (!request.url) {
        request.url = '/style.css';
    }
    if (typeof value === 'string') {
        response.body = value;
    } else if (typeof value === 'function') {
        response.body = value;
    }

    const app = express()
        .use(autoprefixer({ browsers: browsers, cascade: false }))
        .use((req, res, next) => {
            if (req.contentType) {
                res.contentType(req.contentType);
            }
            if (!req.contentType && /\.css$/.test(req.url)) {
                res.contentType('text/css');
            }
            res.setHeader('ETag', 'W/"fake-etag"');
            res.status(200);
            res.write(req.content);
            res.end();
        });

    return expect(app, 'to yield exchange', { request, response });
});

expect.addAssertion('to yield response', (expect, subject, value) => {
    if (typeof subject === 'string') {
        subject = { url: subject };
    }
    const browsers = subject.browsers || 'Chrome > 30';
    const cacheDump = subject.cacheDump || [];
    const app = express()
        .use(autoprefixer({ browsers, cascade: false, _cacheDump: cacheDump }))
        .use(express.static(fixturesPath));
    return expect(app, 'to yield exchange', {
        request: subject,
        response: value
    });
});

describe('express-autoprefixer', () => {
    it('should export a function', () => {
        return expect(autoprefixer, 'to be a function');
    });

    it('should return a function when calling the exported module', () => {
        return expect(autoprefixer(), 'to be a function');
    });

    it('should not mess with request for a non-css file', () => {
        return expect(
            {
                url: '/hello-world.txt',
                contentType: 'text/plain',
                content: 'hello world'
            },
            'to be served as',
            {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    ETag: expect.it('not to match', /-autoprefixer/)
                },
                body: 'hello world'
            }
        );
    });

    it('should prefix animation', () => {
        return expect('.foo { animation: bar; }', 'to be served as', {
            headers: {
                ETag: expect.it('to match', /-autoprefixer/)
            },
            body: expect.it('to contain the same CSS as', '.foo { -webkit-animation: bar; animation: bar; }')
                .and('to contain an inline source map exhaustively satisfying', {
                    version: 3,
                    sources: [ '../../../../style.css' ],
                    names: [],
                    mappings: 'AAAA,OAAO,uBAAe,CAAf,eAAe,EAAE',
                    file: '../../../../style.css',
                    sourcesContent: [ '.foo { animation: bar; }' ]
                })
        });
    });

    it('should not prefix already prefixed properties', () => {
        return expect(
            '.foo { -webkit-animation: bar; animation: bar; }',
            'to be served as',
            expect.it('to contain the same CSS as', '.foo { -webkit-animation: bar; animation: bar; }')
                .and('to contain an inline source map exhaustively satisfying', {
                    version: 3,
                    sources: [ '../../../../style.css' ],
                    names: [],
                    mappings: 'AAAA,OAAO,uBAAuB,CAAC,eAAe,EAAE',
                    file: '../../../../style.css',
                    sourcesContent: [ '.foo { -webkit-animation: bar; animation: bar; }' ]
                })
        );
    });

    it('should not prefix properties supported in the selected browsers', () => {
        return expect(
            {
                content: '.foo { border-radius: 10px; }',
                browsers: 'Chrome > 30'
            },
            'to be served as',
            expect.it('to contain the same CSS as', '.foo { border-radius: 10px; }')
                .and('to contain an inline source map exhaustively satisfying', {
                    version: 3,
                    sources: [ '../../../../style.css' ],
                    names: [],
                    mappings: 'AAAA,OAAO,oBAAoB,EAAE',
                    file: '../../../../style.css',
                    sourcesContent: [ '.foo { border-radius: 10px; }' ]
                })
        );
    });

    it('should work with less files served through express-compiless', () => {
        // express-compiless will compile .less files on the fly and serve the
        // compiled content with content-type text/css on the original url.
        return expect(
            {
                url: '/style.less',
                contentType: 'text/css',
                content: '.foo { animation: bar; }'
            },
            'to be served as',
            expect.it('to contain the same CSS as', '.foo { -webkit-animation: bar; animation: bar; }')
                .and('to contain an inline source map exhaustively satisfying', {
                    version: 3,
                    sources: [ '../../../../style.less' ],
                    names: [],
                    mappings: 'AAAA,OAAO,uBAAe,CAAf,eAAe,EAAE',
                    file: '../../../../style.less',
                    sourcesContent: [ '.foo { animation: bar; }' ]
                })
        );
    });

    it('should work with scss files served through express-compile-sass', () => {
        // express-compile-sass will compile .scss files on the fly and serve the
        // compiled content with content-type text/css on the original url.
        return expect(
            {
                url: '/style.scss',
                contentType: 'text/css',
                content: '.foo { animation: bar; }'
            },
            'to be served as',
            expect.it('to contain the same CSS as', '.foo { -webkit-animation: bar; animation: bar; }')
                .and('to contain an inline source map exhaustively satisfying', {
                    version: 3,
                    sources: [ '../../../../style.scss' ],
                    names: [],
                    mappings: 'AAAA,OAAO,uBAAe,CAAf,eAAe,EAAE',
                    file: '../../../../style.scss',
                    sourcesContent: [ '.foo { animation: bar; }' ]
                })
        );
    });

    it('should serve html without throwing errors', () => {
        return expect(
            {
                url: '/index.html',
                contentType: 'text/html',
                content: '<!DOCTYPE html><html></html>'
            },
            'to be served as',
            '<!DOCTYPE html><html></html>'
        );
    });

    it('should allow a request to respond with 304', () => {
        return expect('GET /foobar.css', 'to yield response', {
            statusCode: 200,
            headers: {
                ETag: /^W\/".*-autoprefixer\[[a-f0-9]{32}\]"$/
            }
        }).then(context => {
            const etag = context.httpResponse.headers.get('ETag');

            return expect(
                {
                    url: '/foobar.css',
                    headers: {
                        'If-None-Match': etag
                    }
                },
                'to yield response',
                {
                    statusCode: 304,
                    headers: {
                        ETag: etag
                    }
                }
            );
        });
    });

    it('should not respond 304 when the autoprefixer config is different', () => {
        return expect(
            {
                url: '/foobar.css',
                browsers: 'Chrome > 29'
            },
            'to yield response',
            {
                statusCode: 200,
                headers: {
                    ETag: /^W\/".*-autoprefixer\[[a-f0-9]{32}\]"$/
                }
            }
        ).then(context => {
            const etag = context.httpResponse.headers.get('ETag');

            return expect(
                {
                    url: '/foobar.css',
                    browsers: 'Chrome > 30',
                    headers: {
                        'If-None-Match': etag
                    }
                },
                'to yield response',
                {
                    statusCode: 200,
                    headers: {
                        ETag: expect.it('not to be', etag)
                    },
                    body: expect.it('to contain the same CSS as', '.foo { -webkit-animation-name: bar; animation-name: bar; }')
                        .and('to contain an inline source map exhaustively satisfying', {
                            version: 3,
                            sources: [ '../../../../foobar.css' ],
                            names: [],
                            mappings: 'AAAA,OAAO,4BAAoB,CAApB,oBAAoB,EAAE',
                            file: '../../../../foobar.css',
                            sourcesContent: [ '.foo { animation-name: bar; }\n' ]
                        })
                }
            );
        });
    });

    it('should respond 200 if a valid etag comes after autoprefixer is enabled', () => {
        return expect('GET /foobar.css', 'to yield response', {
            statusCode: 200,
            headers: {
                ETag: /^W\/".*-autoprefixer\[[a-f0-9]{32}\]"$/
            }
        }).then(context => {
            const etag = context.httpResponse.headers.get('ETag');
            const oldEtag = etag.replace(
                /-autoprefixer\[[a-f0-9]{32}\]"$/,
                '"'
            );
            return expect(
                {
                    url: '/foobar.css',
                    headers: {
                        'If-None-Match': oldEtag
                    }
                },
                'to yield response',
                {
                    statusCode: 200,
                    headers: {
                        ETag: etag
                    }
                }
            );
        });
    });

    it('should not interupt 404s', () => {
        return expect('/noSuchFile.css', 'to yield response', 404);
    });

    describe('contentTypeCache', () => {
        it('should allow a request to respond with 304 for non text/css', () => {
            return expect(
                {
                    url: '/script.js',
                    browsers: 'Chrome > 30'
                },
                'to yield response',
                {
                    statusCode: 200,
                    headers: {
                        ETag: expect.it(
                            'not to match',
                            /^W\/".*-autoprefixer\[[a-f0-9]{32}\]"$/
                        )
                    }
                }
            ).then(context => {
                const eTag = context.httpResponse.headers.get('ETag');
                return expect(
                    {
                        url: '/script.js',
                        headers: {
                            'If-None-Match': eTag
                        }
                    },
                    'to yield response',
                    {
                        statusCode: 304,
                        headers: {
                            ETag: expect.it(
                                'not to match',
                                /^W\/".*-autoprefixer\[[a-f0-9]{32}\]"$/
                            )
                        }
                    }
                );
            });
        });

        it('should allow a request to respond with 304 for text/css', () => {
            return expect(
                {
                    url: '/foobar.css',
                    browsers: 'Chrome > 30'
                },
                'to yield response',
                {
                    statusCode: 200,
                    headers: {
                        ETag: expect.it(
                            'to match',
                            /^W\/".*-autoprefixer\[[a-f0-9]{32}\]"$/
                        )
                    }
                }
            ).then(context => {
                const eTag = context.httpResponse.headers.get('ETag');
                return expect(
                    {
                        url: '/foobar.css',
                        headers: {
                            'If-None-Match': eTag
                        }
                    },
                    'to yield response',
                    {
                        statusCode: 304,
                        headers: {
                            ETag: expect.it(
                                'to match',
                                /^W\/".*-autoprefixer\[[a-f0-9]{32}\]"$/
                            )
                        }
                    }
                );
            });
        });
    });
});
