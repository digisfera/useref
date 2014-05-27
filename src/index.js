/*global module:false, require:false */
'use strict';

// start build pattern: <!-- build:[target] output -->
// $1 is the type, $2 is the alternate search path, $3 is the destination file name
var regbuild = /<!--\s*build:(\w+)(?:\(([^\)]+)\))?\s*([^\s]+)?\s*-->/;

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
    last,
    removeBlockIndex = 0;

  lines.forEach(function (l) {
    var build = l.match(regbuild),
      endbuild = regend.test(l);

    if (build) {
      block = true;

      if(build[1] === 'remove') { build[3] = String(removeBlockIndex++); }
      sections[[build[1], build[3].trim()].join(':')] = last = [];
    }

    // switch back block flag when endbuild
    if (block && endbuild) {
      last.push(l);
      block = false;
    }

    if (block && last) {
      var asset = l.match(/(href|src)=["']([^'"]+)["']/);
      if (asset && asset[2]) {
        // preserve async attribute
        var async = / async/.test(l);
        if (async && last.async === false || last.async && !async) {
          throw new Error('You are not suppose to mix asynced and non-asynced scripts in one block.');
        } else {
          last.async = async;
        }
      }
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
  useref: function (content, block, target, type, async) {
    var linefeed = /\r\n/g.test(content) ? '\r\n' : '\n',
        lines = block.split(linefeed),
        refs = lines.slice(1, -1),
        ref = '',
        indent = (lines[0].match(/^\s*/) || [])[0];

    target = target || 'replace';

    if (refs.length) {
      if (type === 'css') {
        ref = '<link rel="stylesheet" href="' + target + '"\/>';
      } else if (async) {
        ref = '<script async src="' + target + '"></script>';
      } else if (type === 'js') {
        ref = '<script src="' + target + '"></script>';
      } else if (type === 'remove') {
        ref = '';
      }
    }
    return content.replace(block, indent + ref);
  }
};

function updateReferences(blocks, content) {

  // Determine the linefeed from the content
  var linefeed = /\r\n/g.test(content) ? '\r\n' : '\n';

  // handle blocks
  Object.keys(blocks).forEach(function (key) {
    var block = blocks[key].join(linefeed),
      parts = key.split(':'),
      type = parts[0],
      target = parts[1],
      async = blocks[key].async;

    content = helpers.useref(content, block, target, type, async);
  });

  return content;
}

function compactContent(blocks) {

  var result = {};

  Object.keys(blocks).forEach(function (dest) {
    // Lines are the included scripts w/o the use blocks
    var lines = blocks[dest].slice(1, -1),
      parts = dest.split(':'),
      type = parts[0],
      // output is the useref block file
      output = parts[1],
      build = String.prototype.match.apply( blocks[dest][0], [regbuild] );

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
    if (build[2]) {
      // Alternate search path
      result[type][output].searchPaths = build[2];
    }
  });

  return result;
}


