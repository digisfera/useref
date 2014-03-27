/*global module:false, require:false */
'use strict';

// start build pattern: <!-- build:[target] output -->
// $1 is the type, $3 is the file
var regbuild = /<!--\s*build:(\w+)(?:\(([^\)]+)\))?\s*([^\s]+)\s*-->/;

// end build pattern -- <!-- endbuild -->
var regend = /<!--\s*endbuild\s*-->/;


module.exports = function (content) {
  var blocks = getBlocks(content);

  content = updateReferences(blocks, content);

  var replaced = compactContent(blocks);

  return [ content, replaced ];
};


// Returns a hash object of all the directives for the given html. Results is
// of the following form:
//
//     {
//        'css/site.css ':[
//          '  <!-- build:css css/site.css -->',
//          '  <link rel="stylesheet" href="css/style.css">',
//          '  <!-- endbuild -->'
//        ],
//        'js/head.js ': [
//          '  <!-- build:js js/head.js -->',
//          '  <script src="js/libs/modernizr-2.5.3.min.js"></script>',
//          '  <!-- endbuild -->'
//        ],
//        'js/site.js ': [
//          '  <!-- build:js js/site.js -->',
//          '  <script src="js/plugins.js"></script>',
//          '  <script src="js/script.js"></script>',
//          '  <!-- endbuild -->'
//        ]
//     }
//
function getBlocks(body) {
  var lines = body.replace(/\r\n/g, '\n').split(/\n/),
      block = false,
      sections = {},
      last;

  lines.forEach(function (l) {
    var build = l.match(regbuild),
        endbuild = regend.test(l);

    if (build) {
      block = true;
      sections[[build[1], build[3].trim()].join(':')] = last = [];

      if (build[2]) {
        // Alternate search path
        sections.searchPaths = build[2];
      }
    }

    // switch back block flag when endbuild
    if (block && endbuild) {
      last.push(l);
      block = false;
    }

    if (block && last) {
      last.push(l);
    }
  });

  // sections is an array of lines starting with the build block comment opener,
  // including all the references and including the build block comment closer.
  return sections;
}


// Helpers
// -------
var helpers = {
  // useref and useref:* are used with the blocks parsed from directives
  useref: function (content, block, target, type) {
    target = target || 'replace';

    return helpers['useref_' + type](content, block, target);
  },

  useref_css: function (content, block, target) {
    var linefeed = /\r\n/g.test(content) ? '\r\n' : '\n';
    var indent = (block.split(linefeed)[0].match(/^\s*/) || [])[0];
    return content.replace(block, indent + '<link rel="stylesheet" href="' + target + '"\/>');
  },

  useref_js: function (content, block, target) {
    var linefeed = /\r\n/g.test(content) ? '\r\n' : '\n';
    var indent = (block.split(linefeed)[0].match(/^\s*/) || [])[0];
    return content.replace(block, indent + '<script src="' + target + '"></script>');
  }
};

function updateReferences(blocks, content) {

  // Determine the linefeed from the content
  var linefeed = /\r\n/g.test(content) ? '\r\n' : '\n';

  // handle blocks
  Object.keys(blocks).forEach(function (key) {
    if (key !== 'searchPaths') {
      var block = blocks[key].join(linefeed),
          parts = key.split(':'),
          type = parts[0],
          target = parts[1];

      content = helpers.useref(content, block, target, type);
    }
  });

  return content;
}

function compactContent(blocks) {

  var result = {};

  Object.keys(blocks).forEach(function (dest) {
    if (dest !== 'searchPaths') {
      // Lines are the included scripts w/o the use blocks
      var lines = blocks[dest].slice(1, -1),
          parts = dest.split(':'),
          type = parts[0],
          // output is the useref block file
          output = parts[1];

      // parse out the list of assets to handle, and update the grunt config accordingly
      var assets = lines.map(function (tag) {

        // The asset is the string of the referenced source file
        var asset = (tag.match(/(href|src)=["']([^'"]+)["']/) || [])[2];

        // Allow white space and comment in build blocks by checking if this line has an asset or not
        if (asset) {
          return asset;
        }

      }).reduce(function (a, b) {
            b = (b ? b.split(',') : '');
            return b ? a.concat(b) : a;
          }, []);


      result[type] = result[type] || {};
      result[type][output] = { 'assets': assets };
      if (blocks.searchPaths) {
        result[type][output].searchPaths = blocks.searchPaths;
      }
    }
  });

  return result;
}


