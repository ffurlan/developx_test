const util = require('util')

var pp = require('../modules/mz_products');

var set = pp.products;

//console.dir(set); //ALL MAP

console.log('\n MZ PLATFORM FEATURE')
var produto = set.get('MZ_PLATFORM');
console.dir(produto.features.get('MANAGE_PERMISSIONS'));

console.log('\n AS MAP')
var features = pp.getProductsAndFeatures(false);
console.dir(features,{ depth: null });

console.log('\n AS LIST')

features = pp.getProductsAndFeatures(true);
console.dir(features,{ depth: null });