var s3 = require('../modules/mz_cloudstorage');
const fs = require('fs');
const base64js = require('base-64')

let key = 'teste/tizi/2';

var bytes = fs.readFileSync('./jared.jpeg');
bytes = bytes.decode(base64js.encode(bytes))

//let bytes = base64js.decode(base64Data);
s3.uploadBytesToS3WithMetadata(bytes, 'image/jpeg',key)
.then((data) => s3.getPublicUrl(key))
.then((data) => console.log(data));
