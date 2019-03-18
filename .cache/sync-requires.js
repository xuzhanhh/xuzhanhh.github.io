// prefer default export if available
const preferDefault = m => m && m.default || m


exports.components = {
  "component---src-templates-blog-post-js": preferDefault(require("/Users/xuzhanhong1/study/overreacted.io/src/templates/blog-post.js")),
  "component---src-pages-404-js": preferDefault(require("/Users/xuzhanhong1/study/overreacted.io/src/pages/404.js")),
  "component---src-pages-index-js": preferDefault(require("/Users/xuzhanhong1/study/overreacted.io/src/pages/index.js"))
}

