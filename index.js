'use strict';

// start build pattern: <!-- build:[target] output -->
// $1 is the type, $2 is the alternate search path, $3 is the destination file name $4 extra attributes
var regbuild = /(?:<!--|\/\/-)\s*build:(\w+)(?:\(([^\)]+)\))?\s*([^\s]+(?=-->)|[^\s]+)?\s*(?:(.*))?\s*-->/;

// end build pattern -- <!-- endbuild -->
var regend = /(?:<!--|\/\/-)\s*endbuild\s*-->/;

// IE conditional comment pattern: $1 is the start tag and $2 is the end tag
var regcc = /(<!--\[if\s.*?\]>)[\s\S]*?(<!\[endif\]-->)/i;

// Character used to create key for the `sections` object. This should probably be done more elegantly.
var sectionsJoinChar = '\ue000';

// strip all comments from HTML except for conditionals
var regComment = /<!--(?!\s*(?:\[if [^\]]+]|<!|>))(?:(?!-->)(.|\n))*-->/g;

function parseBuildBlock(block) {
  var parts = block.match(regbuild);
  return parts && {
    type: parts[1],
    alternateSearchPaths: parts[2],
    target: parts[3] && parts[3].trim(),
    attbs: parts[4] && parts[4].trim()
  };
}

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
    sectionIndex = 0,
    last,
    removeBlockIndex = 0;

  lines.forEach(function (l) {
    var build = parseBuildBlock(l),
      endbuild = regend.test(l),
      sectionKey;

    if (build) {
      block = true;

      if (build.type === 'remove') {
        build.target = String(removeBlockIndex++);
      }
      if (build.attbs) {
        sectionKey = [build.type, build.target, build.attbs].join(sectionsJoinChar);
      } else if (build.target) {
        sectionKey = [build.type, build.target].join(sectionsJoinChar);
      } else {
        sectionKey = build.type;
      }

      if (sections[sectionKey]) {
        sectionKey += sectionIndex++;
      }

      sections[sectionKey] = last = [];
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

function transformCSSRefs(block, target, attbs) {
  var ref = '';

  // css link element regular expression
  // TODO: Determine if 'href' attribute is present.
  var regcss = /<?link.*?(?:>|\))/gmi;

  // Check to see if there are any css references at all.
  if (block.search(regcss) !== -1) {
    if (attbs) {
      ref = '<link rel="stylesheet" href="' + target + '" ' + attbs + '>';
    } else {
      ref = '<link rel="stylesheet" href="' + target + '">';
    }
  }

  return ref;
}

function transformJSRefs(block, target, attbs) {
  var ref = '';

  // script element regular expression
  // TODO: Detect 'src' attribute.
  var regscript = /<?script\(?\b[^<]*(?:(?!<\/script>|\))<[^<]*)*(?:<\/script>|\))/gmi;

  // Check to see if there are any js references at all.
  if (block.search(regscript) !== -1) {
    if (attbs) {
      ref = '<script src="' + target + '" ' + attbs + '></script>';
    } else {
      ref = '<script src="' + target + '"></script>';
    }
  }

  return ref;
}

function transformReferences(blocks, content, options) {

  // Determine the linefeed from the content
  var linefeed = /\r\n/g.test(content) ? '\r\n' : '\n';

  // handle blocks
  Object.keys(blocks).forEach(function (key) {
    var block = blocks[key].join(linefeed),
      parsed = parseBuildBlock(block),
      handler = options && options[parsed.type],
      lines = block.split(linefeed),
      ref = '',
      indent = (lines[0].match(/^\s*/) || [])[0],
      ccmatches = block.match(regcc),
      blockContent = lines.slice(1, -1).join(linefeed),
      target = parsed.target || 'replace',
      type = parsed.type,
      attbs = parsed.attbs;

    if (type === 'css') {
      ref = transformCSSRefs(blockContent, target, attbs);
    } else if (type === 'js') {
      ref = transformJSRefs(blockContent, target, attbs);
    } else if (type === 'remove') {
      ref = '';
    } else if (handler) {
      ref = handler(blockContent, target, attbs, parsed.alternateSearchPaths);
    } else {
      ref = null;
    }

    if (ref != null) {
      ref = indent + ref;

      // Reserve IE conditional comment if exist
      if (ccmatches) {
        ref = indent + ccmatches[1] + linefeed + ref + linefeed + indent + ccmatches[2];
      }

      if (options.noconcat) {
        content = content.replace(block, blockContent);
      } else {
        content = content.replace(block, ref);
      }
    }
  });

  return content;
}

function removeComments(lines) {
  return lines.join('\n').replace(regComment, '').split('\n');
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
      build = parseBuildBlock(blocks[dest][0]),
      assets;

    // remove html comment blocks
    lines = removeComments(lines);

    // parse out the list of assets to handle, and update the grunt config accordingly
    assets = lines.map(function (tag) {
      // Allow white space and comment in build blocks by checking if this line has an asset or not
      // The asset is the string of the referenced source file
      return (tag.match(/(href|src)=["']([^'"]+)["']/) || [])[2];
    }).reduce(function (a, b) {
      return b ? a.concat(b) : a;
    }, []);

    result[type] = result[type] || {};

    result[type][output] = {
      'assets': assets
    };

    if (build.alternateSearchPaths) {
      // Alternate search path
      result[type][output].searchPaths = build.alternateSearchPaths;
    }
  });

  return result;
}

module.exports = function (content, options) {
  var blocks = getBlocks(content),
    opts = options || {},
    transformedContent = transformReferences(blocks, content, opts),
    replaced = compactContent(blocks);

  return [ transformedContent, replaced ];
};
