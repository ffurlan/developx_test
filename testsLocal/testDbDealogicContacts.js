process.env.NODE_ENV = 'dev';

var db = require('../modules/db_core');
var dbDealogic = require('../modules/db_dealogic');
var mzutil = require('../modules/mz_util');
var config = require('../config');
var _ = require('lodash');
var mzutil = require('../modules/mz_util');

console.log('NODE_ENV =\'', process.env.NODE_ENV, '\' confirm it!');

console.log('Using database: ')
console.dir(config.db_mzcore);

  let
    company_id = '09971686-83cb-4ed2-b72b-d257015baa73',
    user_id = '68ff565d-517e-4f3a-b417-41704e87fd2f';

//db.admin.addCompanyAdmin(company_id, user_id).then(data => { console.dir(data)});

dbDealogic.contacts.getContactDetails(12214).then(data => {
  let dealogic = data;
  console.log('contato ainda nao existe, vou add')
  console.dir(data);
  dealogic.id = mzutil.getUUID();
  dealogic.companyId = company_id;

  db
    .platform
    .addContactFromDealogic(data)
    .then(data => {
      console.dir(data)
    });
})

/*
db
  .company
  .getUsersThatHasPermissionOnCompany(company_id)
  .then(data => {
  console.dir(data);
  })
*/
