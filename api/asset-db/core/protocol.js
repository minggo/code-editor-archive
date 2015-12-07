'use strict';

const Protocol = require('protocol');
const Url = require('fire-url');
const Fs = require('fire-fs');

function _uri2path (urlInfo) {
  let uuid = urlInfo.hostname;
  return Editor.assetdb.uuidToFspath(uuid);
}

// register uuid:// protocol
// =======================================

Protocol.registerFileProtocol('uuid', (request, cb) => {
  let url = decodeURIComponent(request.url);
  let uri = Url.parse(url);
  let file = _uri2path(uri);

  cb ( { path: file } );
}, err => {
  if ( err ) {
    Editor.failed( `Failed to register protocol uuid, ${err.message}` );
    return;
  }
  Editor.success( 'protocol uuid registerred' );
});

Editor.registerProtocol('uuid',_uri2path);

// register thumbnail:// protocol
// =======================================

// function _url2thumbnail (urlInfo) {
//   var uuid = urlInfo.hostname;
//   var dest = Editor.assetdb._uuidToImportPathNoExt(uuid);

//   return dest + '.thumb.png';
// }

Protocol.registerBufferProtocol('thumbnail', (request, cb) => {
  let url = decodeURIComponent(request.url);
  let uri = Url.parse(url);
  let file = _uri2path(uri);

  // jimp process
  // const Jimp = require('jimp');
  // new Jimp(file, (err, image) => {
  //   if ( err ) {
  //     cb(-6); // FILE NOT FOUND
  //     return;
  //   }

  //   let size = parseInt(uri.query) || 32;
  //   let imgWidth = image.bitmap.width;
  //   let imgHeight = image.bitmap.height;
  //   let result = Editor.Utils.fitSize( imgWidth, imgHeight, size, size );

  //   image.resize( Math.ceil(result[0]), Math.ceil(result[1]) );
  //   image.getBuffer( Jimp.MIME_PNG, (err, buffer) => {
  //     cb({
  //       mimeType: 'image/png',
  //       data: buffer,
  //     });
  //   });
  // });

  if ( !Fs.existsSync(file) ) {
      cb(-6); // FILE NOT FOUND
      return;
  }

  //
  const Lwip = require('lwip');
  Lwip.open(file, (err, image) => {
    if ( err ) {
      cb(-6); // FILE NOT FOUND
      return;
    }

    let size = parseInt(uri.query) || 32;
    image.contain(size, size, {r: 255, g: 255, b: 255, a: 0}, 'grid', (err, image) => {
      image.toBuffer( 'png', (err, buffer) => {
        cb({
          mimeType: 'image/png',
          data: buffer,
        });
      });
    });
  });
}, err => {
  if ( err ) {
    Editor.failed( `Failed to register protocol thumbnail, ${err.message}` );
    return;
  }
  Editor.success( 'protocol thumbnail registerred' );
});
