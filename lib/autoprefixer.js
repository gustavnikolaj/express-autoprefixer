var hijackResponse  = require('hijackresponse');
var autoprefixer = require('autoprefixer');
var postcss = require('postcss');

module.exports = function () {
    var args = Array.prototype.slice.call(arguments);

    return function (req, res, next) {
        var fileType = (req.originalUrl.match(/\.(le|c)ss$/) || []).shift();
        // Prevent If-None-Match revalidation with the downstream middleware with ETags that aren't suffixed with "-autoprefixer":
        var ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch) {
            var validIfNoneMatchTokens = ifNoneMatch.split(" ").filter(function (etag) {
                return (/-autoprefixer["-]$/).test(etag);
            });
            if (validIfNoneMatchTokens.length > 0) {
                // Give the upstream middleware a chance to reply 304:
                req.headers['if-none-match'] = validIfNoneMatchTokens.map(function (validIfNoneMatchToken) {
                    return validIfNoneMatchToken.replace(/-autoprefixer(["-])$/, '$1');
                }).join(" ");
            } else {
                delete req.headers['if-none-match'];
            }
        }
        delete req.headers['if-modified-since']; // Prevent false positive conditional GETs after enabling autoprefixer

        hijackResponse(res, function (err, res) {
            if (err) {
                res.unhijack();
                return next(err);
            }

            if (!(!!fileType || /text\/css/.test(res.getHeader('Content-Type')))) {
                return res.unhijack();
            }

            var upstreamETag;

            if (res.statusCode === 304) {
                upstreamETag = res.getHeader('ETag');
                if (upstreamETag && !(/-autoprefixer"$/.test(upstreamETag))) {
                    res.setHeader('ETag', upstreamETag.replace(/"$/, '-autoprefixer"'));
                }
                return res.unhijack();
            } else if (res.statusCode !== 200) {
                return res.unhijack();
            }

            var chunks = [];
            res.on('data', function (chunk) {
                chunks.push(chunk);
            }).on('end', function () {
                var body = Buffer.concat(chunks).toString()
                return postcss([autoprefixer.apply(null, args)])
                    .process(body)
                    .then(function (result) {
                        res.setHeader('Content-Type', 'text/css');
                        upstreamETag = res.getHeader('ETag');
                        if (upstreamETag) {
                            res.setHeader('ETag', upstreamETag.replace(/"$/, '-autoprefixer"'));
                        }
                        res.setHeader('Content-Length', Buffer.byteLength(result.css));
                        res.end(result.css);
                    })
                    .catch(function (err) {
                        res.unhijack();
                        return next(err);
                    });
            });
        });
        return next();
    };
};
