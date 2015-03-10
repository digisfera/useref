/*global module:false, require:false */
'use strict';

// start build pattern: <!-- build:[target] output -->
// $1 is the type, $2 is the alternate search path, $3 is the destination file name $4 extra attributes
var regbuild = /<!--\s*build:(\w+)(?:\(([^\)]+)\))?\s*([^\s]+)?\s*(?:(.*))?\s*-->/;

// end build pattern -- <!-- endbuild -->
var regend = /<!--\s*endbuild\s*-->/;

// IE conditional comment pattern: $1 is the start tag and $2 is the end tag
var regcc = /(<!--\[if\s.*?\]>)[\s\S]*?(<!\[endif\]-->)/i;

// script element regular expression
// TODO: Detect 'src' attribute.
var regscript = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gmi;

// css link element regular expression
// TODO: Determine if 'href' attribute is present.
var regcss = /<link.*?>/gmi;

// Character used to create key for the `sections` object. This should probably be done more elegantly.
var sectionsJoinChar = '\ue000';


module.exports = function (content, options) {
  var blocks = getBlocks(content);

  content = updateReferences(blocks, content, options);

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
      if(build[4]) {
        sections[[build[1], build[3].trim(), build[4].trim()].join(sectionsJoinChar)] = last = [];
      } else if (build[3]) {
        sections[[build[1], build[3].trim()].join(sectionsJoinChar)] = last = [];
      } else {
        sections[build[1]] = last = [];
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
  useref: function (content, block, target, type, attbs, handler) {
    var linefeed = /\r\n/g.test(content) ? '\r\n' : '\n',
        lines = block.split(linefeed),
        ref = '',
        indent = (lines[0].match(/^\s*/) || [])[0],
        ccmatches = block.match(regcc),
        blockContent = lines.slice(1, -1).join('');

    target = target || 'replace';

    if (type === 'css') {

        // Check to see if there are any css references at all.
        if( blockContent.search(regcss) !== -1 )
        {
            if(attbs) {
              ref = '<link rel="stylesheet" href="' + target + '" ' + attbs + '>';
            } else {
              ref = '<link rel="stylesheet" href="' + target + '">';
            }
        }

    } else if (type === 'js') {

        // Check to see if there are any js references at all.
        if( blockContent.search(regscript) !== -1 )
        {
            if(attbs) {
              ref = '<script src="' + target + '" ' + attbs + '></script>';
            } else {
              ref = '<script src="' + target + '"></script>';
            }
        }

    } else if (type === 'remove') {
        ref = '';
    } else {
      ref = handler(blockContent, target, attbs);
    }

    ref = indent + ref;

    // Reserve IE conditional comment if exist
    if (ccmatches) {
      ref = indent + ccmatches[1] + linefeed + ref + linefeed + indent + ccmatches[2];
    }

    return content.replace(block, ref);
  }
};

function updateReferences(blocks, content, options) {

  // Determine the linefeed from the content
  var linefeed = /\r\n/g.test(content) ? '\r\n' : '\n';

  // handle blocks
  Object.keys(blocks).forEach(function (key) {
    var block = blocks[key].join(linefeed),
      parts = key.split(sectionsJoinChar),
      type = parts[0],
      target = parts[1],
      attbs =  parts[2],
      handler = options && options[type];

    content = helpers.useref(content, block, target, type, attbs, handler);
  });

  return content;
}

function compactContent(blocks) {

  var result = {};

  Object.keys(blocks).forEach(function (dest) {
    // Lines are the included scripts w/o the use blocks
    var lines = blocks[dest].slice(1, -1),
      parts = dest.split(sectionsJoinChar),
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
