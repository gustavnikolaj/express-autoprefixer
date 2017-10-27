const hijackResponse = require('hijackresponse');
const autoprefixer = require('autoprefixer');
const postcss = require('postcss');
const LRU = require('lru-cache');
const crypto = require('crypto');

const md5 = str => crypto.createHash('md5').update(str).digest('hex');

// Hardcoded value can be made optional at a later point - but it will have to
// work for now, as it would require a breaking change...
const lruMaxItems = 100;

module.exports = function expressAutoprefixer() {
    const args = Array.prototype.slice.call(arguments);
    const autoprefixerInstance = autoprefixer.apply(null, args);
    const autoprefixerHash = md5(autoprefixerInstance.info());
    const contentTypeCache = new LRU(lruMaxItems);

    return (req, res, next) => {
        const fileType = (req.originalUrl.split('?')[0].match(/\.(le|c)ss$/) || []).shift();
        const cachedContentType = contentTypeCache.get(req.originalUrl);

        // Attempt to load the content type for this URL from the cache. If we
        // have the content-type we can determine up front if we need to do any
        // autoprefixing.
        // This works under the assumption that it is unlikely that a content
        // type will change without the file name changing too.
        // TLDR: If not either the fileType or cachedContentType matches, don't
        // bother trying to autoprefix.
        if (
            !(
                !!fileType ||
                (cachedContentType && /text\/css/.test(cachedContentType))
            )
        ) {
            return next();
        }

        // Prevent If-None-Match revalidation with the downstream middleware
        // with ETags that aren't suffixed with "-autoprefixer":
        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch) {
            const validTokens = ifNoneMatch
                .split(' ')
                .filter(etag =>
                    etag.includes(`-autoprefixer[${autoprefixerHash}]`)
                );
            if (validTokens.length > 0) {
                // Give the upstream middleware a chance to reply 304:
                req.headers['if-none-match'] = validTokens
                    .map(token =>
                        token.replace(
                            /-autoprefixer\[[a-f0-9]{32}\](["-])$/,
                            '$1'
                        )
                    )
                    .join(' ');
            } else {
                delete req.headers['if-none-match'];
            }
        }
        // Prevent false positive conditional GETs after enabling autoprefixer
        delete req.headers['if-modified-since'];

        hijackResponse(res, (err, res) => {
            if (err) {
                res.unhijack();
                return next(err);
            }

            const contentType = res.getHeader('Content-Type');
            contentTypeCache.set(req.originalUrl, contentType);

            if (!(!!fileType || /text\/css/.test(contentType))) {
                return res.unhijack();
            }

            if (res.statusCode === 304) {
                const upstreamETag = res.getHeader('ETag');
                if (upstreamETag) {
                    res.setHeader(
                        'ETag',
                        upstreamETag.replace(
                            /"$/,
                            '-autoprefixer[' + autoprefixerHash + ']"'
                        )
                    );
                }
                return res.unhijack();
            } else if (res.statusCode !== 200) {
                return res.unhijack();
            }

            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString();

                return postcss([autoprefixerInstance])
                    .process(body)
                    .then(result => {
                        res.setHeader('Content-Type', 'text/css');
                        const upstreamETag = res.getHeader('ETag');
                        if (upstreamETag) {
                            res.setHeader(
                                'ETag',
                                upstreamETag.replace(
                                    /"$/,
                                    '-autoprefixer[' + autoprefixerHash + ']"'
                                )
                            );
                        }
                        res.setHeader(
                            'Content-Length',
                            Buffer.byteLength(result.css)
                        );
                        res.end(result.css);
                    })
                    .catch(err => {
                        res.unhijack();
                        return next(err);
                    });
            });
        });
        return next();
    };
};
