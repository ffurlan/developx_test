const Promise = require('bluebird');
const router = require('express-promise-router')();
const validator = require('validator');
const _ = require('lodash');
const requestPromise = require('request-promise');

const CONSTANTS = require('../modules/consts').CONSTANTS;
const send = require('../modules/mz_httphelper');
const config = require('../config');
const db = require('../modules/db_core');
const db_dealogic = require('../modules/db_dealogic');
const mzutil = require('../modules/mz_util');
const cloudstorage = require('../modules/mz_cloudstorage');



// TASK TYPE

router.post("/company/:companyId/taskType", (req, res, next) => {
  let { companyId } = req.params;
  let { taskTypeName, order } = req.body;

  taskTypeId = mzutil.getUUID();
  order = order ? parseInt(order) : 1;

  db.platform
    .addTaskType({ companyId, taskTypeId, taskTypeName, order })
    .then((data) => send.status200(res, { taskTypeId }))
    .then(() => next())
    .catch((err) => next(err));
});

router.post("/company/:companyId/taskType/:taskTypeId", (req, res, next) => {
  let { companyId, taskTypeId } = req.params;
  let { taskTypeName, order } = req.body;
  
  order = order ? parseInt(order) : 1;

  db.platform
    .updateTaskType({ companyId, taskTypeId, taskTypeName, order })
    .then((data) => send.status200(res, { taskTypeId }))
    .then(() => next())
    .catch((err) => next(err));
});

router.delete("/company/:companyId/taskType/:taskTypeId", (req, res, next) => {
  let { companyId, taskTypeId } = req.params;
  
  db.platform
    .deleteTaskType({ companyId, taskTypeId })
    .then((data) => send.status200(res, { taskTypeId }))
    .then(() => next())
    .catch((err) => next(err));
});


router.post("/company/:companyId/taskType/:taskTypeId/taskSubtype", (req, res, next) => {
  let { companyId, taskTypeId } = req.params;
  let { taskSubtypeName, order } = req.body;

  taskSubtypeId = mzutil.getUUID();
  order = order ? parseInt(order) : 1;

  db.platform
    .addTaskSubtype({ companyId, taskTypeId, taskSubtypeId, taskSubtypeName, order })
    .then((data) => send.status200(res, { taskSubtypeId }))
    .then(() => next())
    .catch((err) => next(err));
});

router.post("/company/:companyId/taskType/:taskTypeId/taskSubtype/:taskSubtypeId", (req, res, next) => {
  let { companyId, taskTypeId, taskSubtypeId } = req.params;
  let { taskSubtypeName, order } = req.body;

  order = order ? parseInt(order) : 1;

  db.platform
    .updateTaskSubtype({ companyId, taskTypeId, taskSubtypeId, taskSubtypeName, order })
    .then((data) => send.status200(res, { taskSubtypeId }))
    .then(() => next())
    .catch((err) => next(err));
});


router.delete("/company/:companyId/taskType/:taskTypeId/taskSubtype/:taskSubtypeId", (req, res, next) => {
  let { companyId, taskTypeId, taskSubtypeId } = req.params;

  db.platform
    .deleteTaskSubtype({ companyId, taskTypeId, taskSubtypeId })
    .then((data) => send.status200(res, { taskSubtypeId }))
    .then(() => next())
    .catch((err) => next(err));
});

/// Helper method - Nests (groups by multiple levels)
var nest = (collection, keys) => {
  if (!keys.length) {
    return collection;
  } else {
    return _(collection).groupBy(keys[0])
      .mapValues((values) => {
        return nest(values, keys.slice(1));
      })
      .value();
  }
};

router.get("/company/:companyId/taskTypes", (req, res, next) => {
  let { companyId } = req.params;

  db.platform
    .getTaskTypes({ companyId })
    .then((data) => send.status200(res,  nest(data, ['task_type_id']) ))
   //.then((data) => send.status200(res,  data ))
    .then(() => next())
    .catch((err) => next(err));
});


///////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////// DASHBOARD ///////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////

/// Select Summary (Contacts, Notes, Tasks) YTD
router.get("/company/:companyId/summary", (req, res, next) => {
  let { companyId } = req.params;

  db.platform
    .getPlatformSummary(companyId)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

///////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////// COMPANY USERS /////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////

/// GET - Select Company Users
router.get("/company/:companyId/users", (req, res, next) => {
  let { companyId } = req.params;
  db.platform
    .getCompanyUsers(companyId)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

///////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////// NOTES /////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////

/// Adds/Updates Company Note
/////////////////////////////////////////////
router.post("/company/:companyId/note", (req, res, next) => {
  let { companyId } = req.params;
  let { userId } = req;
  let { id, noteTitle, noteContent, isPrivate, contactId, dealogicContactId, dealogicFundId, dealogicInstitutionId, shareholderId, shareholderGroupId } = req.body;
  id = (id == null ? mzutil.getUUID() : id);

  let p = Promise.resolve(contactId);

  if(dealogicContactId != null) {
    let dealogicContact = {};

    let getDealogicContact = db_dealogic.contacts.getContactDetails(dealogicContactId);
    let getContactByDealogicInvestorContactId =db.platform.getContactByDealogicInvestorContactId(companyId, dealogicContactId);
  
    p = Promise.all([getDealogicContact, getContactByDealogicInvestorContactId])
      .then(([dealogic, contact]) => {
        if (dealogic === null) 
          return Promise.reject({ code: 'DEALOGIC_CONTACT_NOT_FOUND', entity_id: dealogicContactId });
        if(contact.length > 0) return Promise.resolve(contact[0].id);
        
        dealogic.id = mzutil.getUUID();
        dealogic.companyId = companyId;
      
        return db.platform
          .addContactFromDealogic(dealogic)
          .then(data => Promise.resolve(dealogic.id))
      })
  }
  p.then((data) => {
      contactId = data;
      return db.platform
      .addCompanyNote(id, companyId, userId, noteTitle, noteContent, isPrivate, data, dealogicContactId, dealogicFundId, dealogicInstitutionId, shareholderId, shareholderGroupId)
    })
    .then(data => send.status200(res, { noteId: id, contactId: contactId }))
    .then(() => next())
    .catch(err => next(err))
});

/// Select Note Details
router.get("/company/:companyId/note/:noteId", (req, res, next) => {
  let { companyId, noteId } = req.params;

  db.platform
    .getCompanyNoteById(noteId, companyId)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

/// Deletes a Company Note
router.delete("/company/:companyId/note/:noteId", (req, res, next) => {
  let { companyId, noteId } = req.params;

  db.platform
    .deleteCompanyNote(companyId, noteId)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

/// Select My Company Notes (paged)
router.get("/company/:companyId/notes/mine", (req, res, next) => {
  let { companyId } = req.params;
  let { userId } = req;
  let { perPage, pageNumber } = req.query;
  perPage = (perPage == null ? 10 : perPage);
  pageNumber = (pageNumber == null ? 1 : pageNumber);

  db.platform
    .getMyCompanyNotes(userId, companyId, perPage, pageNumber)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

/// Select Company Notes (paged)
router.get("/company/:companyId/notes", (req, res, next) => {
  let { companyId } = req.params;
  let { userId } = req;
  let { perPage, pageNumber } = req.query;
  perPage = (perPage == null ? 10 : perPage);
  pageNumber = (pageNumber == null ? 1 : pageNumber);

  db.platform
    .getCompanyNotes(companyId, userId, perPage, pageNumber)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

/// Select Company Notes for a specific dealogic Contact
router.get("/company/:companyId/notes/byDealogicContact/:dealogicContactId", (req, res, next) => {
  let { companyId, dealogicContactId } = req.params;
  let { userId } = req;
  let { perPage, pageNumber } = req.query;
  perPage = (perPage == null ? 10 : perPage);
  pageNumber = (pageNumber == null ? 1 : pageNumber);

  db.platform
    .getCompanyNotesByDealogicContactId(companyId, userId, dealogicContactId, perPage, pageNumber)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Select Company Notes for a specific Contact
router.get("/company/:companyId/notes/byContact/:contactId", (req, res, next) => {
  let { companyId, contactId } = req.params;
  let { userId } = req;
  let { perPage, pageNumber } = req.query;
  perPage = (perPage == null ? 10 : perPage);
  pageNumber = (pageNumber == null ? 1 : pageNumber);

  db.platform
    .getCompanyNotesByContactId(companyId, userId, contactId, perPage, pageNumber)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Returns Company Notes for a Shareholder
router.get("/company/:companyId/notes/byShareholder/:shareholderId", (req, res, next) => {
  let { companyId, shareholderId } = req.params;
  let { userId } = req;
  let { perPage, pageNumber } = req.query;
  
  perPage = 1000;
  pageNumber = 1;

  db.platform
    .getCompanyNotesByShareholderId(companyId, userId, shareholderId, perPage, pageNumber)
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Returns Company Notes for a Shareholder Group
router.get("/company/:companyId/notes/byShareholderGroup/:shareholderGroupId", (req, res, next) => {
  let { companyId, shareholderGroupId } = req.params;
  let { userId } = req;
  let { perPage, pageNumber } = req.query;
  
  perPage = 1000;
  pageNumber = 1;

  db.platform
    .getCompanyNotesByShareholderGroupId(companyId, userId, shareholderGroupId, perPage, pageNumber)
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});


///////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////// TASKS /////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////

/// Adds/Updates Company Task
// @FURLAN OK
router.post("/company/:companyId/task", (req, res, next) => {
  let { companyId } = req.params;
  let { userId } = req;
  let { taskId, 
        taskTitle, 
        taskType, 
        taskSubType, 
        taskDescription, 
        executorIds, 
        taskDue, 
        taskOrigin, 
        taskStartDate,
        dealogicInstitutionId,
        dealogicFundId,
        mzTaskType,
        mzTaskSubType,
       } = req.body;
  let createdBy = userId;
  taskId = (taskId == null ? mzutil.getUUID() : taskId);

  db.platform
    .addCompanyTask(companyId, taskId, taskTitle, taskType, taskSubType, taskDescription, executorIds, taskDue, createdBy, taskOrigin, taskStartDate, mzTaskType, mzTaskSubType)
    .then((data) => {
      if(dealogicInstitutionId) {
        return db.platform.addTaskInstitution(taskId, dealogicInstitutionId);
      } else if(dealogicFundId) {
        return db.platform.addTaskFund(taskId, dealogicFundId);
      } else {
        return Promise.resolve();
      }
    })
    .then((data) => send.status200(res, { taskId: taskId }))
    .then(() => next())
    .catch(err => next(err));
});


router.post("/company/:companyId/task/:taskId/description", (req, res, next) => {
  let { companyId, taskId } = req.params;
  let { taskDescription } = req.body;

  db.platform
    .updateCompanyTaskDescription({ companyId, taskId, taskDescription })
    .then((data) => send.status200(res, { taskId }))
    .then(() => next())
    .catch(err => next(err));
});

/// Adds Task Executor
router.put("/company/:companyId/task/:taskId/executor/:executorId", (req, res, next) => {
  let { taskId, executorId } = req.params;

  db.platform
    .addTaskExecutor(taskId, executorId)
    .then(data => send.status200(res))
    .then(() => next())
    .catch(err => next(err))
});

/// Removes Task Executor
router.delete("/company/:companyId/task/:taskId/executor/:executorId", (req, res, next) => {
  let { taskId, executorId } = req.params;

  db.platform
    .removeTaskExecutor(taskId, executorId)
    .then(data => send.status200(res))
    .then(() => next())
    .catch(err => next(err))
});

/// Adds Task Contact From Dealogic Contact
router.put("/company/:companyId/task/:taskId/fromDealogicContact/:dealogicContactId", (req, res, next) => {
  let { companyId, taskId, dealogicContactId } = req.params;
  let dealogicContact = {};
  let contactId = null;
  let getDealogicContact = db_dealogic.contacts.getContactDetails(dealogicContactId);
  let getContactByDealogicInvestorContactId = db.platform.getContactByDealogicInvestorContactId(companyId, dealogicContactId);

  p = Promise.all([getDealogicContact, getContactByDealogicInvestorContactId])
    .then(([dealogic, contact]) => {
      if (dealogic === null) 
        return Promise.reject({ code: 'DEALOGIC_CONTACT_NOT_FOUND', entity_id: dealogicContactId });
      if(contact.length > 0) return Promise.resolve(contact[0].id);
      
      dealogic.id = mzutil.getUUID();
      dealogic.companyId = companyId;
    
      return db.platform
        .addContactFromDealogic(dealogic)
        .then(data => Promise.resolve(dealogic.id))
    });

  p
  .then((data) => { 
    contactId = data;
    return db.platform.addTaskContact(taskId, data)})
  .then(data => send.status200(res, { contactId: contactId }))
  .then(() => next())
  .catch(err => next(err));
})

/// Adds Task Contact
router.put("/company/:companyId/task/:taskId/contact/:contactId", (req, res, next) => {
  let { companyId, taskId, contactId } = req.params;
  let { dealogicInvestorId, shareholderGroupId } = req.body;

  if (dealogicInvestorId){
    //Get group vinculated with institution
    return getGroupFromInvestorId(companyId, dealogicInvestorId).then(map => {
      if (map.data && map.data.length > 0 && map.data[0].shareholderGroupId){
          let groupId = map.data[0].shareholderGroupId;
          return db.platform
          .addTaskContactWithInvestorAndGroup(taskId, contactId, dealogicInvestorId, groupId)
          .then((data) => send.status200(res))
          .then(() => next())
          .catch(err => next(err))
      }
      else{
          return db.platform
          .addTaskInstitutionWithInvestor(taskId, contactId, dealogicInvestorId)
          .then((data) => send.status200(res))
          .then(() => next())
          .catch(err => next(err))
      }
    })
  }
  else
  {
    if (shareholderGroupId){
      //Get institution vinculated with Group
      return getInvestorFromShareholderGroup(companyId, shareholderGroupId).then(map => {
        if (map.data && map.data.length > 0 && map.data[0].dealogicInstitutionId){
            let investorId = map.data[0].dealogicInstitutionId;
            return db.platform
            .addTaskContactWithInvestorAndGroup(taskId, contactId, investorId, shareholderGroupId)
            .then((data) => send.status200(res))
            .then(() => next())
            .catch(err => next(err))
          }
          else{
            return db.platform
            .addTaskContactWithGroup(taskId, contactId, shareholderGroupId)
            .then((data) => send.status200(res))
            .then(() => next())
            .catch(err => next(err))
          }
      })
    }
    else{
      return db.platform
      .addTaskContact(taskId, contactId)
      .then(data => send.status200(res))
      .then(() => next())
      .catch(err => next(err))
    }
  }
});

/// Removes Task Contact
router.delete("/company/:companyId/task/:taskId/contact/:contactId", (req, res, next) => {
  let { taskId, contactId } = req.params;

  db.platform
    .removeTaskContact(taskId, contactId)
    .then(data => send.status200(res))
    .then(() => next())
    .catch(err => next(err))
});

/// Adds Task Institution
router.put("/company/:companyId/task/:taskId/institution/:institutionId", (req, res, next) => {
  let { companyId, taskId, institutionId } = req.params;

  return getGroupFromInvestorId(companyId, institutionId).then(map => {
    if (map.data && map.data.length > 0 && map.data[0].shareholderGroupId){
        let groupId = map.data[0].shareholderGroupId;
        return db.platform
        .addTaskInstitutionAndGroup(taskId, institutionId, groupId)
        .then((data) => send.status200(res))
        .then(() => next())
        .catch(err => next(err))
      }
      else{
        return db.platform
        .addTaskInstitution(taskId, institutionId)
        .then((data) => send.status200(res))
        .then(() => next())
        .catch(err => next(err))
      }
  })
});

///<TODO>: Group is vinculated with any investor - TIZI WILL REFACTOR THIS ONE
const getGroupFromInvestorId = (companyId, dealogicInstitutionId) => {
  const mzIrmEndpoint = config.api_endpoints.mz_irm.url;
  const uri = `${mzIrmEndpoint}/dealogicMapping/company/${companyId}/institution/${dealogicInstitutionId}`;

  const options = {
    method: 'GET',
    uri: uri,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    json: true, // Automatically parses the JSON string in the response
  };

  return requestPromise(options);
};

/// Removes Task Institution
router.delete("/company/:companyId/task/:taskId/institution/:institutionId", (req, res, next) => {
  let { taskId, institutionId } = req.params;

  db.platform
    .removeTaskInstitution(taskId, institutionId)
    .then(data => send.status200(res))
    .then(() => next())
    .catch(err => next(err))
});

/// Adds Task Fund
router.put("/company/:companyId/task/:taskId/fund/:fundId", (req, res, next) => {
  let { taskId, fundId } = req.params;

  db.platform
    .addTaskFund(taskId, fundId)
    .then(data => send.status200(res))
    .then(() => next())
    .catch(err => next(err))
});

/// Removes Task Fund
router.delete("/company/:companyId/task/:taskId/fund/:fundId", (req, res, next) => {
  let { taskId, fundId } = req.params;

  db.platform
    .removeTaskFund(taskId, fundId)
    .then(data => send.status200(res))
    .then(() => next())
    .catch(err => next(err));
});

/// Adds Dealogic Investor Contact to Task
router.put("/company/:companyId/task/:taskId/dealogicInvestor/:dealogicInvestorContactId", (req, res, next) => {
  let { taskId, dealogicInvestorContactId } = req.params;
  let { name } = req.body;

  db.platform
    .addTaskDealogicInvestorContact({ taskId, dealogicInvestorContactId, name })
    .then(data => send.status200(res))
    .then(() => next())
    .catch(err => next(err))
});

/// Removes Dealogic Investor Contact from Task
router.delete("/company/:companyId/task/:taskId/dealogicInvestor/:dealogicInvestorContactId", (req, res, next) => {
  let { taskId, dealogicInvestorContactId } = req.params;

  db.platform
    .removeDealogicInvestorContact({ taskId, dealogicInvestorContactId})
    .then(data => send.status200(res))
    .then(() => next())
    .catch(err => next(err));
});


/// Adds Task Shareholder
router.put("/company/:companyId/task/:taskId/shareholder/:shareholderId", (req, res, next) => {
  let { taskId, shareholderId } = req.params;
  let { name } = req.body;

  db.platform
    .addTaskShareholder({ taskId, shareholderId, name })
    .then((data) => send.status200(res))
    .then(() => next())
    .catch(err => next(err))
});

/// Removes Task Shareholder
router.delete("/company/:companyId/task/:taskId/shareholder/:shareholderId", (req, res, next) => {
  let { taskId, shareholderId } = req.params;

  db.platform
    .removeTaskShareholder({ taskId, shareholderId })
    .then((data) => send.status200(res))
    .then(() => next())
    .catch(err => next(err));
});

/// Adds Task Shareholder Group
router.put("/company/:companyId/task/:taskId/shareholderGroup/:shareholderGroupId", (req, res, next) => {
  let { taskId, shareholderGroupId, companyId } = req.params;
  let { name } = req.body;

  //Check if the group is currently vinculated with any investor
  return getInvestorFromShareholderGroup(companyId, shareholderGroupId).then(map => {
    if (map.data && map.data.length > 0 && map.data[0].dealogicInstitutionId){
        const investorId = map.data[0].dealogicInstitutionId;
        return db.platform
        .addTaskShareholderGroupAndInvestor({ taskId, shareholderGroupId, investorId, name })
        .then((data) => send.status200(res))
        .then(() => next())
        .catch(err => next(err))
      }
      else{
        return db.platform
        .addTaskShareholderGroup({ taskId, shareholderGroupId, name })
        .then((data) => send.status200(res))
        .then(() => next())
        .catch(err => next(err))
      }
  })
});

///<TODO>: Group is vinculated with any investor - TIZI WILL REFACTOR THIS ONE
const getInvestorFromShareholderGroup = (companyId, shareholderGroupId) => {
  const mzIrmEndpoint = config.api_endpoints.mz_irm.url;
  const uri = `${mzIrmEndpoint}/dealogicMapping/company/${companyId}/shareholderGroup/${shareholderGroupId}`;

  const options = {
    method: 'GET',
    uri: uri,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    json: true, // Automatically parses the JSON string in the response
  };

  return requestPromise(options);
};

/// Removes Task Shareholder Group
router.delete("/company/:companyId/task/:taskId/shareholderGroup/:shareholderGroupId", (req, res, next) => {
  let { taskId, shareholderGroupId } = req.params;

  db.platform
    .removeTaskShareholderGroup({ taskId, shareholderGroupId })
    .then((data) => send.status200(res))
    .then(() => next())
    .catch(err => next(err));
});

/// Adds Task FollowUp
router.post("/company/:companyId/task/:taskId/followup", (req, res, next) => {
  let { taskId, companyId } = req.params;
  let { annotation, annotationDate } = req.body;
  let { userId } = req;
  let followupId = mzutil.getUUID();
  
  uploadFollowUpAttachment(req.files, companyId, taskId)
    .then((data) => {
      if(!data) {
        data = { fileName: null, fileUrl: null }
      }
      
      return db.platform
        .addTaskFollowUp(followupId, taskId, userId, annotation, annotationDate, data.fileName, data.fileUrl)
    })
    .then(data => send.status200(res))
    .then(() => next())
    .catch(err => next(err))
});

/// Helper method to upload followup attachment
var uploadFollowUpAttachment = function(files, companyId, taskId) {
  if(!files || !files.attachment) return Promise.resolve(null);

  let uploadedFile = files.attachment;
  let s3FileKey = 'followups/'+ companyId + ' /'+ taskId + '/'+  mzutil.getUUID() + '/' + mzutil.getUUID() + '_' + uploadedFile.name;

  return cloudstorage
    .uploadBytesToS3(uploadedFile.data, s3FileKey)
    .then(data => {
      return Promise.resolve({fileName:uploadedFile.name, fileUrl: cloudstorage.getPublicUrl(s3FileKey) });
    })
    .catch(error => {
      Promise.reject(error);
    })
}

/// Removes a Task FollowUp
router.delete("/company/:companyId/task/:taskId/followup/:followupId", (req, res, next) => {
  let { taskId, companyId, followupId } = req.params;
  db.platform
    .removeTaskFollowUp(followupId)
    .then(data => send.status200(res))
    .then(() => next())
    .catch(err => next(err))
});

/// Select Task Details
// @Furlan OK!
router.get("/company/:companyId/task/:taskId", (req, res, next) => {
  let { companyId, taskId } = req.params;

  db.platform
    .getCompanyTaskById(taskId, companyId)
    .then(data => { 
      let result = {
        task: data[0],
        executors: data[1],
        contacts: data[2],
        funds: data[3],
        institutions: data[4], 
        followups: data[5],
        dealogicContats: data[6],
        shareholderAndGroups: data[7]
      };
      return send.status200(res, result)
    })
    .then(() => next())
    .catch(err => next(err))
});

/// Deletes a Company Task
router.delete("/company/:companyId/task/:taskId", (req, res, next) => {
  let { companyId, taskId } = req.params;

  db.platform
    .deleteCompanyTask(companyId, taskId)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

/// GET - Select Tasks by Dealogic Contact
router.get("/company/:companyId/tasks/byDealogicContact/:dealogicContactId", (req, res, next) => {
  let { companyId, dealogicContactId } = req.params;

  db.platform
    .getTasksByDealogicContact({ companyId, dealogicContactId })
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});


/// GET - Select My Tasks (paged)
router.get("/company/:companyId/tasks/mine", (req, res, next) => {
  let { companyId } = req.params;
  let { userId } = req;
  let { perPage, pageNumber } = req.query;
  perPage = (perPage == null ? 10 : perPage);
  pageNumber = (pageNumber == null ? 1 : pageNumber);

  db.platform
    .getMyCompanyTasks(userId, companyId, perPage, pageNumber)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

// GET - FAKE Select My Tasks (paged)
router.get("/public/fake/company/:companyId/tasks/mine", (req, res, next) => {
  let { companyId } = req.params;
  let { perPage, pageNumber } = req.query;
  perPage = (perPage == null ? 10 : perPage);
  pageNumber = (pageNumber == null ? 1 : pageNumber);
  //let userId = 'f6e99850-dd52-4bfa-b67f-ce5084664042'; //Furlan
  let userId = 'e8e0445c-3d0a-41b6-8627-694b5eee7d0b'; //MZDEMO@MZDEMO.COM

  db.platform
    .getMyCompanyTasksFake(userId, companyId, perPage, pageNumber)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Select My Tasks (paged)
router.get("/company/:companyId/tasks/mine/today", (req, res, next) => {
  let { companyId } = req.params;
  let { userId } = req;
  let { perPage, pageNumber } = req.query;
  perPage = (perPage == null ? 10 : perPage);
  pageNumber = (pageNumber == null ? 1 : pageNumber);

  db.platform
    .getMyCompanyTasksForToday(userId, companyId, perPage, pageNumber)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Select Company Tasks (paged)
// @Furlan OK!
router.get("/company/:companyId/tasks", (req, res, next) => {
  let { companyId } = req.params;
  let { perPage, pageNumber } = req.query;
  let { userId } = req;
  perPage = (perPage == null ? 10 : perPage);
  pageNumber = (pageNumber == null ? 1 : pageNumber);

  db.platform
    .getCompanyTasks(companyId, perPage, pageNumber)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Returns Company Tasks by Shareholder
router.get("/company/:companyId/shareholder/:shareholderId/tasks", (req, res, next) => {
  let { companyId, shareholderId } = req.params;
  let { perPage, pageNumber } = req.query;
  let { userId } = req;
  perPage = 1000;
  pageNumber = 1;

  db.platform
    .getCompanyTasksByShareholder({ companyId, shareholderId, perPage, pageNumber })
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Returns Company Tasks by Shareholder Group
router.get("/company/:companyId/shareholderGroup/:shareholderGroupId/tasks", (req, res, next) => {
  let { companyId, shareholderGroupId } = req.params;
  let { perPage, pageNumber } = req.query;
  let { userId } = req;
  perPage = 1000;
  pageNumber = 1;

  db.platform
    .getCompanyTasksByShareholderGroup({ companyId, shareholderGroupId, perPage, pageNumber })
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Returns Company Tasks by Dealogic Institution Id
router.get("/company/:companyId/institution/:dealogicInstitutionId/tasks", (req, res, next) => {
  let { companyId, dealogicInstitutionId } = req.params;

  db.platform
    .getCompanyTasksByInstitutionId({ companyId, dealogicInstitutionId })
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Returns Company Tasks by Dealogic Fund Id
router.get("/company/:companyId/fund/:dealogicFundId/tasks", (req, res, next) => {
  let { companyId, dealogicFundId } = req.params;

  db.platform
    .getCompanyTasksByFundId({ companyId, dealogicFundId })
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});



/// Select Company Tasks by DealogicContactId (paged)
router.get("/company/:companyId/tasks/byDealogicContact/:dealogicContactId", (req, res, next) => {
  let { companyId, dealogicContactId } = req.params;
  let { perPage, pageNumber } = req.query;
  let { userId } = req;
  perPage = (perPage == null ? 10 : perPage);
  pageNumber = (pageNumber == null ? 1 : pageNumber);

  db.platform
    .getCompanyTasksByDealogicContactId(companyId, userId, dealogicContactId, perPage, pageNumber)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Select Company Tasks by ContactId (paged)
router.get("/company/:companyId/tasks/byContact/:contactId", (req, res, next) => {
  let { companyId, contactId } = req.params;
  let { perPage, pageNumber } = req.query;
  let { userId } = req;
  perPage = (perPage == null ? 10 : perPage);
  pageNumber = (pageNumber == null ? 1 : pageNumber);

  db.platform
    .getCompanyTasksByContactId(companyId, userId, contactId, perPage, pageNumber)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});


///////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////// CONTACTS ////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////

/// Retrieves a Contact given a investorContactId from dealogic
router.get("/company/:companyId/contact/fromDealogic/:investorContactId", (req, res, next) => {
  let { companyId, investorContactId } = req.params;

  db.platform
    .getContactByDealogicInvestorContactId(companyId, investorContactId)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Favorites a Contact From PublicContact
router.post("/company/:companyId/contact/importFromPublicContact/:publicContactId", (req, res, next) => {
  let { companyId, publicContactId } = req.params;
  let contactId = mzutil.getUUID();
  let getPublicContact = db.platform.getPublicContactById({ publicContactId });
  let getContactByPublicContactId = db.platform.getContactByPublicContactId({ companyId, publicContactId });

  Promise.all([ getPublicContact, getContactByPublicContactId ])
    .then(([ dealogicTemp, contact ]) => {
      if (dealogicTemp === null) {
        let result = {
          code: 'PUBLIC_CONTACT_NOT_FOUND',
          publicContactId
        };

        return send.status200(res, result, false);
      } else if(contact.length > 0) { 
        return send.status200(res, { code: 'PUBLIC_CONTACT_ALREADY_IMPORTED'}, false);
      } else {
        return db.platform.favoritePublicContactById({ companyId, contactId, publicContactId })
            .then(data => send.status200(res, { contactId }))
      }
    })
    .then(() => next())
    .catch(err => next(err));
});


/// Imports a contact from Dealogic
router.post("/company/:companyId/contact/importFromDealogic/:investorContactId", (req, res, next) => {
  let { companyId, investorContactId } = req.params;
  let dealogicContact = {};
  let dealogic = {};
  let getDealogicContact = db_dealogic.contacts.getContactDetails(investorContactId);
  let getContactByDealogicInvestorContactId =db.platform.getContactByDealogicInvestorContactId(companyId, investorContactId);

  return Promise.all([getDealogicContact, getContactByDealogicInvestorContactId])
    .then(([dealogicTemp, contact]) => {
      if (dealogicTemp === null) {
        let result = {
          code: 'DEALOGIC_CONTACT_NOT_FOUND',
          entity_id: investorContactId
        };

        send.status200(res, result, false);
        return next(result)
      }
      dealogic = dealogicTemp;

      if (contact.length <= 0) { //Contact not imported yet
        dealogic.id = mzutil.getUUID();
        dealogic.companyId = companyId;

        return uploadDealogicProfileImage(dealogic.details.picture, 'image/gif', companyId, dealogic.id)
          .then((data) => {
            dealogic.details.picture_url = data;
            return db
              .platform
              .addContactFromDealogic(dealogic)
              .then(data => {
                send.status200(res, { id: dealogic.id });
                return next();
              })
          })        
      } else { // contato ja foi importado anteriormente, nao sera reimportado!
        send.status200(res, {
          code: 'DEALOGIC_CONTACT_ALREADY_IMPORTED'
        }, false);
      }

      return next();
    })
    .then(() => next())
    .catch(err => next(err));
});

/// Vinculates contact with Shareholder
router.post("/company/:companyId/contact/:contactId/shareholder", (req, res, next) => {
  const { companyId, contactId } = req.params;
  const { shareholderId } = req.body;

  db.platform
    .vinculateContactWithShareholder({ companyId, contactId, shareholderId })
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Vinculates contact with Shareholder Group
router.post("/company/:companyId/contact/:contactId/shareholderGroup", (req, res, next) => {
  const { companyId, contactId } = req.params;
  const { shareholderGroupId } = req.body;

  db.platform
    .vinculateContactWithShareholderGroup({ companyId, contactId, shareholderGroupId })
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});


/// Removes association to Shareholder from Contact
router.delete("/company/:companyId/contact/:contactId/shareholder", (req, res, next) => {
  const { companyId, contactId } = req.params;

  db.platform
    .unlinkContactWithShareholder({ companyId, contactId })
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Removes association to Shareholder from Contact
router.delete("/company/:companyId/contact/:contactId/shareholderGroup", (req, res, next) => {
  const { companyId, contactId } = req.params;

  db.platform
    .unlinkContactWithShareholderGroup({ companyId, contactId })
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Removes association to Shareholder / Investor from Contact
router.delete("/company/:companyId/contact/:contactId/shareholderGroup/investor", (req, res, next) => {
  const { companyId, contactId } = req.params;

  db.platform
    .unlinkContactWithShareholderGroupAndInvestor({ companyId, contactId })
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});


/// Associates a contact with a IRM Contact (Company)
router.post("/company/:companyId/contact/:contactId/IRMAssociate", (req, res, next) => {
  const { companyId, contactId } = req.params;
  const { stakeholderCompanyId } = req.body;

  db.platform
    .associateContactWithIRM(companyId, contactId, stakeholderCompanyId)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
})

/// Disassociates a contact from IRM Contact (Company)
router.post("/company/:companyId/contact/:contactId/IRMDisassociate", (req, res, next) => {
  const { companyId, contactId } = req.params;

  db.platform
    .disassociateContactWithIRM(companyId, contactId)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
})

/// Deletes a contact given its Id
router.delete("/company/:companyId/contact/:contactId", (req, res, next) => {
  const { companyId, contactId } = req.params;

  db.platform
    .deleteContactById(companyId, contactId)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Search a contact by name
router.post("/company/:companyId/contact/search", (req, res, next) => {
  let { companyId } = req.params;
  let { name } = req.query;

  db.platform
    .searchContactByName(companyId, name)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Retrieves a contact given its Id
router.get("/company/:companyId/contact/:contactId", (req, res, next) => {
  let { companyId, contactId } = req.params;

  db.platform
    .getContactById(companyId, contactId)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Retrieves multiple contacts info by a list of id
router.post("/company/:companyId/contacts", (req, res, next) => {
  let { companyId } = req.params;
  let { dealogicContactIds } = req.body;

  dealogicContactIds = dealogicContactIds.map(dc => parseInt(dc));

  db.platform
    .getContactsById({ companyId, dealogicContactIds })
    .then(data => send.status200(res, data))
    .then(() => next())
    //.catch(err => next(err));
});

/// Retrieves multiple contacts info by a list of id
router.post("/company/:companyId/contacts/search", (req, res, next) => {
  let { companyId } = req.params;
  let { dealogicContactIds, searchTerms } = req.body;

  dealogicContactIds = dealogicContactIds.map(dc => parseInt(dc));

  db.platform
    .getContactsByIdAndTerm({ companyId, dealogicContactIds, searchTerms })
    .then(data => send.status200(res, data))
    .then(() => next())
    //.catch(err => next(err));
});

/// GET - Retrieves a paginated list of contacts
router.get("/company/:companyId/contacts", (req, res, next) => {
  let { companyId } = req.params;
  let { userId } = req;
  let { perPage, pageNumber, profileType, searchText } = req.query;
  perPage = (perPage == null ? 10 : perPage);
  pageNumber = (pageNumber == null ? 1 : pageNumber);

  db.platform
    .getContactListPaginated({ companyId, profileType, searchText, perPage, pageNumber})
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// GET - Retrieves a list of contacts for a shareholder
router.get("/company/:companyId/shareholder/:shareholderId/contacts", (req, res, next) => {
  let { companyId, shareholderId } = req.params;
  let { userId } = req;
  let { perPage, pageNumber } = req.query;
  perPage = 1000;
  pageNumber = 1;

  db.platform
    .getContactListForShareholder({ companyId, shareholderId, perPage, pageNumber })
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// GET - Retrieves a list of contacts for a shareholder group
router.get("/company/:companyId/shareholderGroup/:shareholderGroupId/contacts", (req, res, next) => {
  let { companyId, shareholderGroupId } = req.params;
  let { userId } = req;
  let { perPage, pageNumber } = req.query;
  perPage = 1000;
  pageNumber = 1;

  db.platform
    .getContactListForShareholderGroup({ companyId, shareholderGroupId, perPage, pageNumber })
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// GET - Retrieves a specific contact notes
router.get("/company/:companyId/contact/public/:dealogicInvestorContactId/notes", (req, res, next) => {
  let { companyId, dealogicInvestorContactId } = req.params;

  db.platform
    .getNotesFromDealogicContactId({ companyId, dealogicInvestorContactId })
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// POST - Update contact Notes
router.post("/company/:companyId/contact/public/:dealogicInvestorContactId/notes", (req, res, next) => {
  let { companyId, dealogicInvestorContactId } = req.params;
  let { notes } = req.body;

  db.platform
    .updateNoteOnDealogicContactId(companyId, dealogicInvestorContactId, notes)
    .then((data) => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});


/// POST - Adds/updates a Simple Contact-  Simple contact is the one Furlan ASKED that is not vinculated with Dealogic at all
router.post("/company/:companyId/simpleContact", (req, res, next) => {
  let { companyId } = req.params;
  let { id, name, email_1, email_2, profile_type, phone_number, company_name, job_title, 
    source, annotations, shareholderId, shareholderGroupId, address, city, state, zipcode, country, cellphone_number, 
  phone_number_iq , main_language } = req.body;
  let isNew = false;

  if (id == null) {
    isNew = true;
    id = mzutil.getUUID();
  }

  db.platform
    .addSimpleContact(id, companyId, name, email_1, email_2, profile_type, phone_number, company_name, job_title, source, 
      annotations, true, isNew, shareholderId, shareholderGroupId,
      address, city, state, zipcode, country, phone_number_iq, cellphone_number, main_language
      )
    .then((data) => send.status200(res, { contactId: id }))
    .then(() => next())
    .catch(err => next(err));
});

/// Add/Updates a Contact Business Card
router.post("/company/:companyId/contactFromApp", (req, res, next) => {
  let { companyId } = req.params;
  let { name, email_1, businessCardData, businessCardContentType } = req.body;
  let contactId = mzutil.getUUID();

  db.platform
    .addSimpleContact(contactId, companyId, name, email_1, null, null, null, null, null, null, null, true, true) //REMARK: Porquice FURLAN APP PRO!
    .then(() => { 
      if(businessCardData != null) {
        return uploadBusinessCard(businessCardData, businessCardContentType, companyId, contactId)
        .then((data) => db.platform.updateContactBusinessCard(contactId, data))
      } else return Promise.resolve();
    })
    .then(data => send.status200(res))
    .then(() => next())
    .catch((err) => next(err));
});

/// Add/Updates a Contact Business Card
router.put("/company/:companyId/contact/:contactId/businessCard", (req, res, next) => {
  let { companyId, contactId } = req.params;
  let { businessCardData, businessCardContentType } = req.body;

  uploadBusinessCard(businessCardData, businessCardContentType, companyId, contactId)
    .then((data) => db.platform.updateContactBusinessCard(contactId, data))
    .then(data => send.status200(res))
    .then(() => next())
    .catch((err) => next(err));
});

/// Update Dealogic Investor Id
router.put("/company/:companyId/contact/:contactId/dealogicInvestor/:dealogicInvestorId", (req, res, next) => {
  let { companyId, contactId, dealogicInvestorId } = req.params;

  db.platform
    .updateContactInvestorId(companyId, contactId, dealogicInvestorId)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Helper method to upload profile picture
var uploadBusinessCard = (base64Data, businessCardContentType, companyId, contactId) => {
    if(!base64Data || base64Data == null) return Promise.resolve(null);

    let s3FileKey = 'businessCards/'+ companyId + ' /'+ contactId + '/'+  mzutil.getUUID() + '/' + mzutil.getUUID() + '_businessCard.jpg';
    let bytes = Buffer.from(base64Data, 'base64')

    return cloudstorage
      .uploadBytesToS3WithMetadata(bytes, businessCardContentType, s3FileKey)
      .then(data => Promise.resolve(cloudstorage.getPublicUrl(s3FileKey)))
      .catch(error => Promise.reject(error))
}

var uploadDealogicProfileImage = (bytes, contentType, companyId, contactId) => {
  if(!bytes || bytes == null) return Promise.resolve(null);

  let s3FileKey = 'contactProfile/'+ companyId + ' /'+ contactId + '/'+  mzutil.getUUID() + '/' + mzutil.getUUID() + '.gif';

  return cloudstorage
    .uploadBytesToS3WithMetadata(bytes, contentType, s3FileKey)
    .then(data => Promise.resolve(cloudstorage.getPublicUrl(s3FileKey)))
    .catch(error => Promise.reject(error))
}

/// POST - Adds/updates Contact Job Function
router.post("/public/company/:companyId/contact/:contactId/jobFunction", (req, res, next) => {
  const { companyId, contactId } = req.params;
  let { id, name } = req.body;
  id = (id == null ? mzutil.getUUID() : id);

  db.platform
    .addUpdateContactJobFunction(contactId, id, name)
    .then(data => send.status200(res, { id: id}))
    .then(() => next())
    .catch((err) => next(err));
});

/// Removes a Company Contact Job Function by Id
router.delete("/public/company/:companyId/contact/:contactId/jobFunction/:id", (req, res, next) => {
  const { companyId, contactId, id } = req.params;

  db.platform
    .deleteContactJobFunction(contactId, id)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch((err) => next(err));
});

/// Adds a Company Contact Country
router.post("/public/company/:companyId/contact/:contactId/country", (req, res, next) => {
  let { companyId, contactId } = req.params;
  let { id, country_name } = req.body;
  id = (id == null ? mzutil.getUUID() : id);

  db.platform
    .addUpdateContactCountry(contactId, id, country_name)
    .then(data => send.status200(res, { id: id}))
    .then(() => next())
    .catch((err) => next(err));
});

/// Removes a Company Contact Country
router.delete("/public/company/:companyId/contact/:contactId/country/:id", (req, res, next) => {
  let { companyId, contactId, id } = req.params;

  db.platform
    .deleteContactCountry(contactId, id)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Adds/updates a Company Contact Sector
router.post("/public/company/:companyId/contact/:contactId/sector", (req, res, next) => {
  let { companyId, contactId } = req.params;
  let { id, sector_name } = req.body;
  id = (id == null ? mzutil.getUUID() : id);

  db.platform
    .addUpdateContactSector(contactId, id, sector_name)
    .then(data => send.status200(res, { id: id }))
    .then(() => next())
    .catch(err => next(err))
});

/// Removes a Company Contact Sector
router.delete("/public/company/:companyId/contact/:contactId/sector/:id", (req, res, next) => {
  let { companyId, contactId, id } = req.params;

  db.platform
    .deleteContactSector(contactId, id)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Adds/updates a Company Contact Document
router.post("/public/company/:companyId/contact/:contactId/document", (req, res, next) => {
  let { companyId, contactId } = req.params;
  let { id, document_type, document_number } = req.body;
  id = (id == null ? mzutil.getUUID() : id);

  db.platform
    .addUpdateContactDocument(contactId, id, document_type, document_number)
    .then(data => send.status200(res, { id: id}))
    .then(() => next())
    .catch(err => next(err));
});

/// Removes a Company Contact Document
router.delete("/public/company/:companyId/contact/:contactId/document/:id", (req, res, next) => {
  let { companyId, contactId, id } = req.params;

  db.platform
    .deleteContactDocument(contactId, id)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

/// Adds/updates a Company Contact Email
router.post("/public/company/:companyId/contact/:contactId/email", (req, res, next) => {
  let { companyId, contactId } = req.params;
  let { id, email_type, email_address } = req.body;
  id = (id == null ? mzutil.getUUID() : id);

  db.platform
    .addUpdateContactEmail(contactId, id, email_type, email_address)
    .then(data => send.status200(res, { id: id}))
    .then(() => next())
    .catch(err => next(err));
});

/// Removes a Company Contact Email
router.delete("/public/company/:companyId/contact/:contactId/email/:id", (req, res, next) => {
  let { companyId, contactId, id } = req.params;

  db.platform
    .deleteContactEmail(contactId, id) //TODO!!!
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});

/// Adds/updates a Company Contact Phone Number
router.post("/company/:companyId/contact/:contactId/phoneNumber", (req, res, next) => {
  let { companyId, contactId } = req.params;
  let { id, phone_type, phone_number } = req.body;
  id = (id == null ? mzutil.getUUID() : id);
  //console.log(req.body);
  //console.log('id --> ' + id);
  
  db.platform
    .addUpdateContactPhoneNumber(id, contactId, phone_type, phone_number, false)
    .then(data => send.status200(res, { id : id }))
    .then(() => next())
    .catch(err => next(err));
});

/// Removes a Company Contact Phone Number
router.delete("/company/:companyId/contact/:contactId/phoneNumber/:id", (req, res, next) => {
  let { companyId, contactId, id } = req.params;

  db.platform
    .deleteContactPhoneNumber(contactId, id)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

/// Adds/updates a Company Contact Education
router.post("/public/company/:companyId/contact/:contactId/education", (req, res, next) => {
  let { companyId, contactId } = req.params;
  let { id, graduation_year, school_name, program, degree_type } = req.body;
  id = (id == null ? mzutil.getUUID() : id);

  db.platform
    .addUpdateContactEducation(companyId, contactId, id, graduation_year, school_name, program, degree_type)
    .then(data => send.status200(res, { id : id}))
    .then(() => next())
    .catch(err => next(err));
});

/// Removes a Company Contact Education
router.delete("/public/company/:companyId/contact/:contactId/education/:id", (req, res, next) => {
  const { companyId, contactId, id } = req.params;

  db.platform
    .deleteContactEducation(contactId, id)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err));
});


///////////////////////////////////////////////////////////
/////////////////// TASK ANALYTICS ///////////////////////
//////////////////////////////////////////////////////////

/// Returns Task Analytics  Grouped by Year/Executor
router.post("/company/:companyId/tasks/analytics/perExecutor/byYear", (req, res, next) => {
  const { companyId } = req.params;
  const { initialDate, endDate } = req.body;

  if (!validator.isUUID(companyId) || (!initialDate) || (!endDate)) {
    send.error400(res, CONSTANTS.ERROR_400_INVALID_FIELD);
    return next();
  }

  let result = {
    years: [],
    executors: [],
    data: []
  };

  let tempData = {};

  db.platform
    .getTaskAnalyticsPerExecutorByYear({companyId, initialDate, endDate})
    .then((data) => {
      
      // Iterates each grouped item to extract: years, executors and save the total tasks per year/executor
      _.each(data, item => {
        if(!_.includes(result.years, item.task_year)) {
          result.years.push(item.task_year);
        }

        if(!_.includes(result.executors, item.executor_name)) {
          result.executors.push(item.executor_name);
        }
        if(!tempData[item.task_year])
          tempData[item.task_year] = {};

        tempData[item.task_year][item.executor_name] = parseInt(item.task_total);
      })

      // Iterates for each year/executor to format the data in highcharts format
      _.each(result.years, current_year => {
        _.each(result.executors, current_executor => {
          let qtyTasks = tempData[current_year][current_executor] ? tempData[current_year][current_executor] : 0;

          let executorData = _.find(result.data, filter => filter.name == current_executor);
          if(!executorData) { 
            executorData = { name: current_executor, data: [ qtyTasks ]};
            result.data.push(executorData);
          } else {
            executorData.data.push(qtyTasks);
          }
        })
      });

      return Promise.resolve(result);
    })
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

/// Returns Task Analytics per Month/Executor
router.post("/company/:companyId/tasks/analytics/perExecutor/byMonth", (req, res, next) => {
  const { companyId } = req.params;
  const { initialDate, endDate } = req.body;

  if (!validator.isUUID(companyId) || (!initialDate) || (!endDate)) {
    send.error400(res, CONSTANTS.ERROR_400_INVALID_FIELD);
    return next();
  }

  let result = {
    months: [],
    executors: [],
    data: []
  };

  let tempData = {};

  db.platform
    .getTaskAnalyticsPerExecutorByMonth({companyId, initialDate, endDate})
    .then((data) => {
      
      // Iterates each grouped item to extract: months, executors and save the total tasks per month/executor
      _.each(data, item => {
        if(!_.includes(result.months, item.task_month)) {
          result.months.push(item.task_month);
        }

        if(!_.includes(result.executors, item.executor_name)) {
          result.executors.push(item.executor_name);
        }
        if(!tempData[item.task_month])
          tempData[item.task_month] = {};

        tempData[item.task_month][item.executor_name] = parseInt(item.task_total);
      })

      // Iterates for each month/executor to format the data in highcharts format
      _.each(result.months, current_month => {
        _.each(result.executors, current_executor => {
          let qtyTasks = tempData[current_month][current_executor] ? tempData[current_month][current_executor] : 0;

          let executorData = _.find(result.data, filter => filter.name == current_executor);
          if(!executorData) { 
            executorData = { name: current_executor, data: [ qtyTasks ]};
            result.data.push(executorData);
          } else {
            executorData.data.push(qtyTasks);
          }
        })
      });

      return Promise.resolve(result);
    })
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});


/// Returns Task Analytics per Executor By Totals
router.post("/company/:companyId/tasks/analytics/perExecutor/byTotals", (req, res, next) => {
  const { companyId } = req.params;
  const { initialDate, endDate } = req.body;

  if (!validator.isUUID(companyId) || (!initialDate) || (!endDate)) {
    send.error400(res, CONSTANTS.ERROR_400_INVALID_FIELD);
    return next();
  }

  db.platform
    .getTaskAnalyticsPerExecutorByTotals({companyId, initialDate, endDate})
    .then(data => send.status200(res, data.map(d => { return { executor_name: d.executor_name, task_total: parseInt(d.task_total) }} )))
    .then(() => next())
    .catch(err => next(err))
});


/// Returns Task Analytics  Grouped by Year/Executor
router.post("/company/:companyId/tasks/analytics/perType/byYear", (req, res, next) => {
  const { companyId } = req.params;
  const { initialDate, endDate } = req.body;

  if (!validator.isUUID(companyId) || (!initialDate) || (!endDate)) {
    send.error400(res, CONSTANTS.ERROR_400_INVALID_FIELD);
    return next();
  }

  let result = {
    years: [],
    types: [],
    data: []
  };

  let tempData = {};

  db.platform
    .getTaskAnalyticsPerTypeByYear({companyId, initialDate, endDate})
    .then((data) => {
      
      // Iterates each grouped item to extract: years, types and save the total tasks per year/type
      _.each(data, item => {
        item.task_type = item.task_type;

        if(!_.includes(result.years, item.task_year)) {
          result.years.push(item.task_year);
        }

        if(!_.includes(result.types, item.task_type)) {
          result.types.push(item.task_type);
        }
        if(!tempData[item.task_year])
          tempData[item.task_year] = {};

        tempData[item.task_year][item.task_type] = parseInt(item.task_total);
      })

      // Iterates for each year/type to format the data in highcharts format
      _.each(result.years, current_year => {
        _.each(result.types, current_type => {
          let qtyTasks = tempData[current_year][current_type] ? tempData[current_year][current_type] : 0;

          let executorData = _.find(result.data, filter => filter.name == current_type);
          if(!executorData) { 
            executorData = { name: current_type, data: [ qtyTasks ]};
            result.data.push(executorData);
          } else {
            executorData.data.push(qtyTasks);
          }
        })
      });

      return Promise.resolve(result);
    })
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

/// Returns Task Analytics per Month/Executor
router.post("/company/:companyId/tasks/analytics/perType/byMonth", (req, res, next) => {
  const { companyId } = req.params;
  const { initialDate, endDate } = req.body;

  if (!validator.isUUID(companyId) || (!initialDate) || (!endDate)) {
    send.error400(res, CONSTANTS.ERROR_400_INVALID_FIELD);
    return next();
  }

  let result = {
    months: [],
    types: [],
    data: []
  };

  let tempData = {};

  db.platform
    .getTaskAnalyticsPerTypeByMonth({companyId, initialDate, endDate})
    .then((data) => {
      
      // Iterates each grouped item to extract: months, executors and save the total tasks per month/executor
      _.each(data, item => {
        item.task_type =  item.task_type;

        if(!_.includes(result.months, item.task_month)) {
          result.months.push(item.task_month);
        }

        if(!_.includes(result.types, item.task_type)) {
          result.types.push(item.task_type);
        }
        if(!tempData[item.task_month])
          tempData[item.task_month] = {};

        tempData[item.task_month][item.task_type] = parseInt(item.task_total);
      })

      // Iterates for each month/executor to format the data in highcharts format
      _.each(result.months, current_month => {
        _.each(result.types, current_type => {
          let qtyTasks = tempData[current_month][current_type] ? tempData[current_month][current_type] : 0;

          let executorData = _.find(result.data, filter => filter.name == current_type);
          if(!executorData) { 
            executorData = { name: current_type, data: [ qtyTasks ]};
            result.data.push(executorData);
          } else {
            executorData.data.push(qtyTasks);
          }
        })
      });

      return Promise.resolve(result);
    })
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

/// Returns Task Analytics per Executor By Totals
router.post("/company/:companyId/tasks/analytics/perType/byTotals", (req, res, next) => {
  const { companyId } = req.params;
  const { initialDate, endDate } = req.body;

  if (!validator.isUUID(companyId) || (!initialDate) || (!endDate)) {
    send.error400(res, CONSTANTS.ERROR_400_INVALID_FIELD);
    return next();
  }

  db.platform
    .getTaskAnalyticsPerTypeByTotals({companyId, initialDate, endDate})
    .then(data => send.status200(res, data.map(d => { return { task_type: d.task_type, task_total: parseInt(d.task_total) }} )))
    .then(() => next())
    .catch(err => next(err))
});

/// Return contact information by email
router.post("/company/:companyId/contact/email/search", (req, res, next) => {
  const { companyId } = req.params;
  const { email } = req.body;

  if (!validator.isUUID(companyId)) {
    send.error400(res, CONSTANTS.ERROR_400_INVALID_FIELD);
    return next();
  }

  db.platform
    .searchContactByEmail(companyId, email)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});

/// Return contact information by email
router.post("/company/:companyId/contact/mine/search", (req, res, next) => {
  const { companyId } = req.params;
  const { searchTerm } = req.body;

  if (!validator.isUUID(companyId)) {
    send.error400(res, CONSTANTS.ERROR_400_INVALID_FIELD);
    return next();
  }

  db.platform
    .searchContactByNameAndEmail(companyId, searchTerm)
    .then(data => send.status200(res, data))
    .then(() => next())
    .catch(err => next(err))
});



module.exports = router;
