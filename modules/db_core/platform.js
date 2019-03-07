const Promise = require('bluebird'); // or any other Promise/A+ compatible library;
Promise.config({
  warnings: { wForgottenReturn: false }, // Enable warnings
  longStackTraces: true, // Enable long stack traces
  cancellation: true,   // Enable cancellation
  monitoring: true // Enable monitoring
});

var logger = require('../mz_logger');
var mzutil = require('../mz_util');
var db = null;

module.exports.initDb = function(dbRef) {
  db = dbRef;
};


module.exports.addTaskType = function({ companyId, taskTypeId, taskTypeName, order }) {
  let sql = {
    text: `
    INSERT INTO mzplatform.task_type (company_id, task_type_id, task_type_name, "order") VALUES ($1, $2, $3, $4);`,
    values: [ companyId, taskTypeId, taskTypeName, order ]
  };
  console.log(sql);
  return db.none(sql);
};

module.exports.updateTaskType = function({ companyId, taskTypeId, taskTypeName, order }) {
  let sql = {
    text: `
    UPDATE mzplatform.task_type SET task_type_name = $3, "order" = $4 WHERE company_id = $1 AND task_type_id = $2;`,
    values: [ companyId, taskTypeId, taskTypeName, order ]
  };

  return db.none(sql);
};

module.exports.deleteTaskType = function({ companyId, taskTypeId }) {
  var sqlUptTasks = `UPDATE mzplatform.task SET mz_task_subtype = NULL, mz_task_type = NULL WHERE mz_task_type = $1;`
  var sqlDelTaskType = `UPDATE mzplatform.task_type SET is_deleted = TRUE WHERE company_id = $1 AND task_type_id = $2;`;
  return db.tx(t => t.batch(
    [t.none(sqlUptTasks, [ taskTypeId ]),
     t.none(sqlDelTaskType, [ companyId, taskTypeId])
   ]) );
};



module.exports.addTaskSubtype = function({ companyId, taskTypeId, taskSubtypeId, taskSubtypeName, order }) {
  let sql = {
    text: `
    INSERT INTO mzplatform.task_subtype (company_id, task_type_id, task_subtype_id, task_subtype_name, "order")
    VALUES ($1, $2, $3, $4, $5);`,
    values: [ companyId, taskTypeId, taskSubtypeId, taskSubtypeName, order ]
  };

  return db.none(sql);
};

module.exports.updateTaskSubtype = function({ companyId, taskTypeId, taskSubtypeId, taskSubtypeName, order }) {
  let sql = {
    text: `
    UPDATE mzplatform.task_subtype 
    SET task_subtype_name = $4, "order" = $5
    WHERE company_id = $1 AND task_type_id = $2 AND task_subtype_id = $3;`,
    values: [ companyId, taskTypeId, taskSubtypeId, taskSubtypeName, order ]
  };

  return db.none(sql);
};

module.exports.deleteTaskSubtype = function({ companyId, taskTypeId, taskSubtypeId }) {
  var sqlUptTasks = `UPDATE mzplatform.task SET mz_task_subtype = NULL WHERE mz_task_subtype = $1;`
  var sqlDelTaskType = ` UPDATE mzplatform.task_subtype SET is_deleted = TRUE WHERE company_id = $1 AND task_type_id = $2 AND task_subtype_id = $3;`;
  return db.tx(t => t.batch(
    [t.none(sqlUptTasks, [ taskSubtypeId ]),
     t.none(sqlDelTaskType, [ companyId, taskTypeId, taskSubtypeId])
  ]) );
};

module.exports.getTaskTypes = function({ companyId }) {
  let sql = {
    text: `
    SELECT 
    tt.task_type_id, 
    case when tst.is_deleted = false then tst.task_subtype_id else null end task_subtype_id, 
    tt.task_type_name, 
    case when tst.is_deleted = false then tst.task_subtype_name else null end task_subtype_name, 
    tt."order" AS task_type_order, 
    case when tst.is_deleted = false then tst."order" else null end task_subtype_order,
    t.total
  FROM mzplatform.task_type tt
  LEFT JOIN mzplatform.task_subtype tst ON tt.task_type_id = tst.task_type_id
  LEFT JOIN (
  select task_type_id, count(task_subtype) total
  from mzplatform.task_subtype
  where company_id = $1
  group by task_type_id
  ) t
  on t.task_type_id = tt.task_type_id
  WHERE tt.company_id = $1 AND tt.is_deleted = FALSE AND ((tst IS NULL OR tst.is_deleted = false) or (tst.is_deleted = true and t.total IS NOT NULL))
  ORDER BY tt."order", tst."order"
  `,
    values: [ companyId ]
  };

  return db.query(sql);
};


///////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////// DASHBOARD ///////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////

/////////// Gets Platform Summary Totals (Total Contacts, Total Notes and Total Tasks) for a Company
module.exports.getPlatformSummary = (companyId) => {
  var sql = {
    name: 'sel-platform-summary',
    text: `
    SELECT COUNT(1) as totals from mzplatform.contact c
           WHERE c.company_id = $1 AND EXTRACT(YEAR FROM c.created_at) = EXTRACT(YEAR FROM now())
    UNION ALL
    SELECT COUNT(1) from mzplatform.notes n
           WHERE n.company_id = $1 AND EXTRACT(YEAR FROM n.created_at) = EXTRACT(YEAR FROM now())  AND n.is_private = FALSE
    UNION ALL
    SELECT COUNT(1) from mzplatform.task t
           WHERE t.company_id = $1 AND EXTRACT(YEAR FROM t.task_due) = EXTRACT(YEAR FROM now())
    `,
    values: [ companyId ]
  };

  return db.query(sql).then(data => {
    let totals = {
      totalContacts: parseInt(data[0].totals),
      totalNotes: parseInt(data[1].totals),
      totalTasks: parseInt(data[2].totals)
    };
    return totals;
  });
};


///////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////// COMPANY USERS /////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////

/////////// Gets a list of company users
module.exports.getCompanyUsers = (companyId) => {
  var sql = {
    name: 'sel-company-users',
    text: `
    SELECT u.id, u.name, u.email FROM users.mzuser u WHERE
    u.id IN
    (
      SELECT DISTINCT user_id FROM "authorization".company_user_permission WHERE company_id = $1
    ) AND u.is_user_mz = False
    ORDER BY u.name;
    `,
    values: [ companyId ]
  };

  return db.query(sql);
};

///////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////// NOTES /////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////

/////////// Adds a new company note
module.exports.addCompanyNote = (id, companyId, createdById, noteTitle, noteContent, isPrivate,
                                 contactId, dealogicContactId, dealogicFundId, dealogicInstitutionId, shareholderId, shareholderGroupId) => {
  var sql = {
    name: 'ins-company-note',
    text: `
    INSERT INTO mzplatform.notes (id, company_id, note_title, note_content, is_private, created_by, contact_id, dealogic_fund_id, dealogic_institution_id, shareholder_id, shareholder_group_id)
    VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO UPDATE SET
    note_title = EXCLUDED.note_title,
    note_content = EXCLUDED.note_content,
    is_private = EXCLUDED.is_private,
    dealogic_fund_id = EXCLUDED.dealogic_fund_id,
    dealogic_institution_id = EXCLUDED.dealogic_institution_id,
    shareholder_id = EXCLUDED.shareholder_id,
    shareholder_group_id = EXCLUDED.shareholder_group_id,
    updated_at = now(),
    contact_id = EXCLUDED.contact_id
    ;`,
    values: [ id, companyId, noteTitle, noteContent, isPrivate, createdById, contactId, dealogicFundId, dealogicInstitutionId, shareholderId, shareholderGroupId ]
  };

  return db.none(sql);
};

/////////// Gets a company note given its id
module.exports.getCompanyNoteById = (id, companyId) => {
  var sql = {
    name: 'sel-company-note-by-id',
    text: `
    SELECT
          n.id, 
          company_id, 
          note_title, 
          note_content, 
          is_private, 
          created_by, 
          u.name created_by_name,
          n.contact_id, 
          n.dealogic_contact_id, 
          n.dealogic_fund_id, 
          n.dealogic_institution_id, 
          n.shareholder_id, 
          n.shareholder_group_id,
          n.created_at,
          n.updated_at
    FROM mzplatform.notes n
    JOIN users.mzuser u on u.id = n.created_by
    WHERE n.id = $1;`,
    values: [ id ]
  };

  return db.oneOrNone(sql);
};

/////////// Gets user's company notes paginated
module.exports.getMyCompanyNotes = (userId, companyId, perPage, pageNumber) => {
  var sql = {
    name: 'sel-company-notes-mine-paged',
    text: `
    SELECT
      n.id, company_id, note_title, note_content, is_private, created_by, u.name created_by_name,
      n.contact_id, n.dealogic_contact_id, n.dealogic_fund_id, n.dealogic_institution_id, n.created_at, n.updated_at
    FROM mzplatform.notes n
    JOIN users.mzuser u on u.id = n.created_by
    WHERE company_id = $1 AND created_by = $2
    ORDER BY created_at DESC
    LIMIT ${perPage} OFFSET ${(pageNumber -1 ) * perPage}
    ;`,
    values: [ companyId, userId ]
  };

  return db.query(sql);
};

/////////// Gets all company notes paginated
module.exports.getCompanyNotes = (companyId, userId, perPage, pageNumber) => {
  var sql = {
    name: 'sel-company-notes-paged',
    text: `
    SELECT
      n.id, company_id, note_title, note_content, is_private, n.note_content
      created_by, u.name created_by_name,
      n.contact_id, n.dealogic_contact_id, n.dealogic_fund_id, n.dealogic_institution_id, n.created_at, n.updated_at
    FROM mzplatform.notes n
    JOIN users.mzuser u on u.id = n.created_by
    WHERE company_id = $1 AND
    (n.created_by = $2 OR (n.created_by <> $2 AND n.is_private = FALSE))
    ORDER BY created_at DESC
    LIMIT ${perPage} OFFSET ${(pageNumber -1 ) * perPage}
    ;`,
    values: [ companyId, userId]
  };

  return db.query(sql);
};

/////////// Gets all company notes for a dealogic contact id paginated
module.exports.getCompanyNotesByDealogicContactId = (companyId, userId, dealogicContactId, perPage, pageNumber) => {
  var sql = {
    name: 'sel-company-notes-paged-dealogic-contact-id',
    text: `
    SELECT
      n.id, company_id, note_title, note_content, is_private, created_by, u.name created_by_name,
      n.contact_id, n.dealogic_contact_id, n.dealogic_fund_id, n.dealogic_institution_id, n.created_at, n.updated_at
    FROM mzplatform.notes n
    JOIN users.mzuser u on u.id = n.created_by
    WHERE company_id = $1 AND n.dealogic_contact_id = $3 AND
    (n.created_by = $2 OR (n.created_by <> $2 AND n.is_private = FALSE))
    ORDER BY created_at DESC
    LIMIT ${perPage} OFFSET ${(pageNumber -1 ) * perPage}
    ;`,
    values: [ companyId, userId, dealogicContactId]
  };

  return db.query(sql);
};

/////////// Gets all company notes for a shareholderId
module.exports.getCompanyNotesByShareholderId = (companyId, userId, shareholderId, perPage, pageNumber) => {
  let sql = `
    SELECT
      n.id, 
      company_id, 
      note_title, 
      note_content, 
      is_private, 
      created_by, 
      u.name created_by_name,
      n.contact_id, 
      n.dealogic_contact_id, 
      n.dealogic_fund_id, 
      n.dealogic_institution_id, 
      n.created_at, n.updated_at
    FROM mzplatform.notes n
    JOIN users.mzuser u on u.id = n.created_by
    WHERE company_id = $1 AND n.shareholder_id = $3 AND
    (n.created_by = $2 OR (n.created_by <> $2 AND n.is_private = FALSE))
    ORDER BY created_at DESC
    LIMIT ${perPage} OFFSET ${(pageNumber -1 ) * perPage}
    ;`;

  return db.query(sql, [ companyId, userId, shareholderId ]);
};

/////////// Gets all company notes for a shareholder group id
module.exports.getCompanyNotesByShareholderGroupId = (companyId, userId, shareholderGroupId, perPage, pageNumber) => {
  let sql = `
    SELECT
      n.id, 
      company_id, 
      note_title, 
      note_content, 
      is_private, 
      created_by, 
      u.name created_by_name,
      n.contact_id, 
      n.dealogic_contact_id, 
      n.dealogic_fund_id, 
      n.dealogic_institution_id, 
      n.created_at, n.updated_at
    FROM mzplatform.notes n
    JOIN users.mzuser u on u.id = n.created_by
    WHERE company_id = $1 AND n.shareholder_group_id = $3 AND
    (n.created_by = $2 OR (n.created_by <> $2 AND n.is_private = FALSE))
    ORDER BY created_at DESC
    LIMIT ${perPage} OFFSET ${(pageNumber -1 ) * perPage}
    ;`;

  return db.query(sql, [ companyId, userId, shareholderGroupId ]);
};



/////////// Gets all company notes for a contact id paginated
module.exports.getCompanyNotesByContactId = (companyId, userId, contactId, perPage, pageNumber) => {
  return db.query(`
  SELECT
    n.id, company_id, note_title, note_content, is_private, created_by, u.name created_by_name,
    n.contact_id, n.dealogic_contact_id, n.dealogic_fund_id, n.dealogic_institution_id, n.created_at, n.updated_at
  FROM mzplatform.notes n
  JOIN users.mzuser u on u.id = n.created_by
  WHERE company_id = $1 AND n.contact_id = $3 AND
  (n.created_by = $2 OR (n.created_by <> $2 AND n.is_private = FALSE))
  ORDER BY created_at DESC
  LIMIT ${perPage} OFFSET ${(pageNumber -1 ) * perPage}
  ;`, [ companyId, userId, contactId]);
};

/////////// Deletes a company note given its id
module.exports.deleteCompanyNote = (companyId, id) => {
  var sql = {
    name: 'del-company-note-by-id',
    text: `DELETE FROM mzplatform.notes WHERE id = $1 and company_id = $2;`,
    values: [ id, companyId ]
  };

  return db.none(sql);
};

///////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////// TASKS /////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////

//////////////// Adds a company task
module.exports.addCompanyTask = (companyId, taskId, taskTitle, taskType, taskSubType, taskDescription, executorIds, taskDue, createdBy, taskOrigin, taskStartDate, mzTaskType, mzTaskSubType) => {
  let insert = `INSERT INTO mzplatform.task (company_id, task_id, task_title, task_type, task_subtype, task_description, task_due, created_by, task_origin, task_start_date, mz_task_type, mz_task_subtype)
  VALUES ($1,$2,$3,$4,$5,$6,$7, $8, $9, $10, $11, $12) ON CONFLICT (task_id) DO UPDATE SET
  task_title = EXCLUDED.task_title,
  task_type = EXCLUDED.task_type,
  task_subtype = EXCLUDED.task_subtype,
  task_description = EXCLUDED.task_description,
  task_due = EXCLUDED.task_due,
  task_origin = EXCLUDED.task_origin,
  task_start_date = EXCLUDED.task_start_date,
  mz_task_type = EXCLUDED.mz_task_type,
  mz_task_subtype = EXCLUDED.mz_task_subtype;`;

  let values = [companyId, taskId, taskTitle, taskType, taskSubType, taskDescription, taskDue, createdBy, taskOrigin, taskStartDate, mzTaskType, mzTaskSubType];
  console.log(insert);
  console.log(values);
  return db.none(insert, values)
        .then(() => db.tx(t => t.batch(executorIds.map(o => t.none(`INSERT INTO mzplatform.task_executor(task_id, executor_id) VALUES ($1, $2);`,[taskId, o])))))
};


module.exports.updateCompanyTaskDescription = ({ companyId, taskId, taskDescription }) => {
  let sql = {
    text: `UPDATE mzplatform.task SET task_description = $3 WHERE company_id = $1 AND task_id = $2;`,
    values: [ companyId, taskId, taskDescription ]
  }
  
  return db.none(sql);
};

/// Adds Task Executor
module.exports.addTaskExecutor = (taskId, executorId) => {
  return db.none(`INSERT INTO mzplatform.task_executor(task_id, executor_id) VALUES ($1, $2);`,[taskId, executorId]);
}

/// Remove Task Executor
module.exports.removeTaskExecutor = (taskId, executorId) => {
  return db.none(`DELETE FROM mzplatform.task_executor WHERE task_id = $1 AND executor_id = $2;`,[taskId, executorId]);
}

/// Adds Task Contact
module.exports.addTaskContact = (taskId, contactId) => {
  return db.none(`INSERT INTO mzplatform.task_contact(task_id, contact_id) VALUES ($1, $2);`,[taskId, contactId]);
}

/// Adds Task Contact, Dealogic Institution and Shareholder Group
module.exports.addTaskContactWithInvestorAndGroup = (taskId, contactId, dealogicInvestorId, shareholderGroupId) => {
  var sqlTaskShareholderGroup = `DELETE FROM mzplatform.task_shareholder WHERE task_id=$1 AND shareholder_group_id = $2; INSERT INTO mzplatform.task_shareholder(task_id, shareholder_group_id) VALUES ($1, $2);`
  var sqlTaskShareholderInvestor = `DELETE FROM mzplatform.task_institution WHERE task_id=$1 AND dealogic_institution_id = $2; INSERT INTO mzplatform.task_institution(task_id, dealogic_institution_id) VALUES ($1, $2);`
  var sqlTaskContact = `DELETE FROM mzplatform.task_contact where task_id = $1 AND contact_id = $2; INSERT INTO mzplatform.task_contact(task_id, contact_id) VALUES ($1, $2);`;
  return db.tx(t => t.batch(
    [t.none(sqlTaskShareholderGroup, [ taskId, shareholderGroupId ]),
     t.none(sqlTaskShareholderInvestor, [ taskId, dealogicInvestorId]),
     t.none(sqlTaskContact, [ taskId, contactId])
   ]) );
}

/// Adds Task Contact and Dealogic Institution
module.exports.addTaskInstitutionWithInvestor = (taskId, contactId, dealogicInvestorId) => {
  var sqlTaskShareholderInvestor = `DELETE FROM mzplatform.task_institution WHERE task_id=$1 AND dealogic_institution_id = $2; INSERT INTO mzplatform.task_institution(task_id, dealogic_institution_id) VALUES ($1, $2);`
  var sqlTaskContact = `DELETE FROM mzplatform.task_contact where task_id = $1 AND contact_id = $2; INSERT INTO mzplatform.task_contact(task_id, contact_id) VALUES ($1, $2);`;
  return db.tx(t => t.batch(
     [t.none(sqlTaskShareholderInvestor, [ taskId, dealogicInvestorId]),
     t.none(sqlTaskContact, [ taskId, contactId])
   ]) );
}

/// Adds Task Contact and Shareholder Group
module.exports.addTaskContactWithGroup = (taskId, contactId, shareholderGroupId) => {
  var sqlTaskShareholderGroup = `DELETE FROM mzplatform.task_shareholder WHERE task_id=$1 AND shareholder_group_id = $2; INSERT INTO mzplatform.task_shareholder(task_id, shareholder_group_id) VALUES ($1, $2);`
  var sqlTaskContact = `DELETE FROM mzplatform.task_contact where task_id = $1 AND contact_id = $2; INSERT INTO mzplatform.task_contact(task_id, contact_id) VALUES ($1, $2);`;
  return db.tx(t => t.batch(
    [t.none(sqlTaskShareholderGroup, [ taskId, shareholderGroupId ]),
     t.none(sqlTaskContact, [ taskId, contactId])
   ]) );
}

/// Remove Task Contact
module.exports.removeTaskContact = (taskId, contactId) => {
  return db.none(`DELETE FROM mzplatform.task_contact WHERE task_id = $1 AND contact_id = $2;`,[taskId, contactId]);
}


/// Adds Task Institution
module.exports.addTaskInstitution = (taskId, dealogicInstitutionId) => {
  return db.none(`INSERT INTO mzplatform.task_institution(task_id, dealogic_institution_id) VALUES ($1, $2);`,[taskId, dealogicInstitutionId]);
}

/// Adds Task Institution
module.exports.addTaskInstitutionAndGroup = (taskId, dealogicInstitutionId, groupId) => {
  var sqlTaskShareholderGroup = `DELETE FROM mzplatform.task_shareholder WHERE task_id=$1 AND shareholder_group_id = $2; INSERT INTO mzplatform.task_shareholder(task_id, shareholder_group_id) VALUES ($1, $2);`
  var sqlTaskShareholderInvestor = `DELETE FROM mzplatform.task_institution WHERE task_id=$1 AND dealogic_institution_id = $2; INSERT INTO mzplatform.task_institution(task_id, dealogic_institution_id) VALUES ($1, $2);`
  return db.tx(t => t.batch(
    [t.none(sqlTaskShareholderGroup, [ taskId, groupId ]),
     t.none(sqlTaskShareholderInvestor, [ taskId, dealogicInstitutionId])
   ]) );
}

/// Remove Task Institution
module.exports.removeTaskInstitution = (taskId, dealogicInstitutionId) => {
  return db.none(`DELETE FROM mzplatform.task_institution WHERE task_id = $1 AND dealogic_institution_id = $2;`,[taskId, dealogicInstitutionId]);
}

/// Adds Task Fund
module.exports.addTaskFund = (taskId, dealogicFundId) => {
  return db.none(`INSERT INTO mzplatform.task_fund(task_id, dealogic_fund_id) VALUES ($1, $2);`,[taskId, dealogicFundId]);
}

/// Remove Task Fund
module.exports.removeTaskFund = (taskId, dealogicFundId) => {
  return db.none(`DELETE FROM mzplatform.task_fund WHERE task_id = $1 AND dealogic_fund_id = $2;`,[taskId, dealogicFundId]);
}

/// Adds Task Dealogic Investor Contact
module.exports.addTaskDealogicInvestorContact = ({taskId, dealogicInvestorContactId, name }) => {
  return db.none(`INSERT INTO mzplatform.task_dealogic_contact(task_id, dealogic_investor_contact_id, name) VALUES ($1, $2, $3);`,[taskId, dealogicInvestorContactId, name]);
}

/// Remove Dealogic Investor Contact
module.exports.removeDealogicInvestorContact = ({taskId, dealogicInvestorContactId}) => {
  return db.none(`DELETE FROM mzplatform.task_dealogic_contact WHERE task_id = $1 AND dealogic_investor_contact_id= $2;`,[taskId, dealogicInvestorContactId]);
}

/// Adds Task Shareholder
module.exports.addTaskShareholder = function({ taskId, shareholderId, name }) {
  return db.none(`INSERT INTO mzplatform.task_shareholder(task_id, shareholder_id, name) VALUES ($1, $2, $3);`,[ taskId, shareholderId, name ]);
}

/// Remove Task Shareholder
module.exports.removeTaskShareholder = function({ taskId, shareholderId }) {
  return db.none(`DELETE FROM mzplatform.task_shareholder WHERE task_id = $1 AND shareholder_id = $2;`,[ taskId, shareholderId ]);
}

/// Adds Task Shareholder Group
module.exports.addTaskShareholderGroup = function({ taskId, shareholderGroupId, name }) {
  return db.none(`INSERT INTO mzplatform.task_shareholder(task_id, shareholder_group_id, name) VALUES ($1, $2, $3);`,[ taskId, shareholderGroupId, name ]);
}

/// Adds Task Shareholder Group
module.exports.addTaskShareholderGroupAndInvestor = function({ taskId, shareholderGroupId, investorId ,name }) {
  var sqlTaskShareholderGroup = `DELETE FROM mzplatform.task_shareholder WHERE task_id=$1 AND shareholder_group_id = $2; INSERT INTO mzplatform.task_shareholder(task_id, shareholder_group_id, name) VALUES ($1, $2, $3);`
  var sqlTaskShareholderInvestor = `DELETE FROM mzplatform.task_institution WHERE task_id=$1 AND dealogic_institution_id = $2; INSERT INTO mzplatform.task_institution(task_id, dealogic_institution_id) VALUES ($1, $2);`
  return db.tx(t => t.batch(
    [t.none(sqlTaskShareholderGroup, [ taskId, shareholderGroupId, name ]),
     t.none(sqlTaskShareholderInvestor, [ taskId, investorId])
   ]) );
}

/// Remove Task Shareholder Group
module.exports.removeTaskShareholderGroup = function({ taskId, shareholderGroupId }) {
  return db.none(`DELETE FROM mzplatform.task_shareholder WHERE task_id = $1 AND shareholder_group_id = $2;`,[ taskId, shareholderGroupId ]);
}

/// Adds Task FollowUp
module.exports.addTaskFollowUp = (followupId, taskId, createdBy, annotation, annotationDate, attachmentName, attachmentUrl) => {
  return db.none(`
  INSERT INTO mzplatform.task_followup
  ( followup_id, task_id, created_by, annotation, 
    annotation_date, attachment_name, 
    attachment_url) 
    VALUES 
  ($1, $2, $3, $4, $5, $6, $7);`,
  [followupId, taskId, createdBy, annotation, annotationDate, attachmentName, attachmentUrl]);
}

/// Removes a Task FollowUp
module.exports.removeTaskFollowUp = (followupId) => {
  return db.none(`
  DELETE FROM  mzplatform.task_followup WHERE followup_id = $1;`,
  [followupId]);
}

/////////// Gets a company task given its id
module.exports.getCompanyTaskById = (id, companyId) => {
  var sqlTask = {
    name: 'sel-company-task-by-id',
    text: `
    SELECT
          t.task_id, t.task_origin, t.task_type, t.task_subtype, t.task_title, t.task_description, TO_CHAR(t.task_due,'YYYY-MM-DD') task_due, TO_CHAR(t.task_start_date,'YYYY-MM-DD') task_start_date, 
          tt.task_type_id mz_task_type_id, tt.task_type_name mz_task_type_name, ts.task_subtype_id mz_task_subtype_id, ts.task_subtype_name mz_task_subtype_name,
          t.created_at, t.updated_at
    FROM mzplatform.task t
    LEFT JOIN mzplatform.task_type tt
    ON tt.task_type_id = t.mz_task_type
    LEFT JOIN mzplatform.task_subtype ts
    ON ts.task_subtype_id = t.mz_task_subtype
    WHERE t.company_id = $1 AND t.task_id = $2;`,
    values: [ companyId, id ]
  };

  let sqlExecutors = `
  SELECT 
      u.id, u.name 
  FROM users.mzuser u 
  JOIN mzplatform.task_executor te ON te.executor_id = u.id 
  JOIN mzplatform.task t ON t.task_id = te.task_id
  WHERE t.task_id = $1
  ORDER BY u.name;`;

  let sqlContacts = `
  SELECT 
    c.id, c.name, c.email_1 
  FROM mzplatform.contact c 
  JOIN mzplatform.task_contact tc ON tc.contact_id = c.id 
  JOIN mzplatform.task t ON t.task_id = tc.task_id
  WHERE t.task_id = $1
  ORDER BY c.name;`;

  let sqlFunds = `
  SELECT 
    tf.*
  FROM mzplatform.task_fund tf
  WHERE tf.task_id = $1
  ORDER BY tf.name;`;

  let sqlInstitutions = `
  SELECT 
    ti.*
  FROM mzplatform.task_institution ti
  WHERE ti.task_id = $1
  ORDER BY ti.name;`;

  let sqlFollowUps = `
  SELECT 
    t.*
  FROM mzplatform.task_followup t
  WHERE t.task_id = $1
  ORDER BY t.annotation_date DESC;`;

  let sqlDealogicContacts = `
  SELECT 
    t.*
  FROM mzplatform.task_dealogic_contact t
  WHERE t.task_id = $1
  ORDER BY t.name ASC;`;

  let sqlShareholderAndGroups = `
  SELECT 
    t.*
  FROM mzplatform.task_shareholder t
  WHERE t.task_id = $1
  ORDER BY t.name ASC;`;

  return db.tx(t => t.batch([t.one(sqlTask),
                             t.query(sqlExecutors, [id]),
                             t.query(sqlContacts, [id]),
                             t.query(sqlFunds, [id]),
                             t.query(sqlInstitutions, [id]),
                             t.query(sqlFollowUps, [id]),
                             t.query(sqlDealogicContacts, [id]),
                             t.query(sqlShareholderAndGroups, [id]),
                            ]) );
};

/// Get Tasks by Dealogic Contact
module.exports.getTasksByDealogicContact = function({ companyId, dealogicContactId })  {
  let sql = {
    text: `
    SELECT
        t.task_id, t.task_type, t.task_subtype, t.task_title, t.task_description, DATE(t.task_due) task_due, t.task_start_date, tt.task_type_id mz_task_type_id, tt.task_type_name mz_task_type_name, ts.task_subtype_id mz_task_subtype_id, ts.task_subtype_name mz_task_subtype_name,
        (SELECT COUNT(1) FROM mzplatform.task_dealogic_contact tdc WHERE t.task_id = tdc.task_id)::int count_dealogic_contacts,
        (SELECT COUNT(1) FROM mzplatform.task_shareholder ts WHERE t.task_id = ts.task_id)::int count_shareholders,
        (SELECT COUNT(1) FROM mzplatform.task_contact tc WHERE t.task_id = tc.task_id)::int count_contacts,
        (SELECT STRING_AGG(u.name,'#| ') FROM mzplatform.task_executor te JOIN users.mzuser u ON te.executor_id = u.id WHERE t.task_id = te.task_id)::varchar executors,
        (SELECT STRING_AGG(tdc.name,'#| ') FROM mzplatform.task_dealogic_contact tdc WHERE t.task_id = tdc.task_id)::varchar dealogic_contacts,
        (SELECT STRING_AGG(ts.name,'#| ') FROM mzplatform.task_shareholder ts WHERE t.task_id = ts.task_id)::varchar task_shareholders          
    FROM mzplatform.task t
    LEFT JOIN mzplatform.task_type tt
    ON tt.task_type_id = t.mz_task_type
    LEFT JOIN mzplatform.task_subtype ts
    ON ts.task_subtype_id = t.mz_task_subtype
    WHERE 
    (  
      t.task_id IN (
        SELECT task_id FROM mzplatform.task_dealogic_contact WHERE dealogic_investor_contact_id = $2
        )
      OR 
      t.task_id IN (
        SELECT task_id FROM mzplatform.task_contact WHERE contact_id IN ( 
            SELECT id FROM mzplatform.contact WHERE company_id = $1 AND dealogic_investor_contact_id = $2
        )
      )
    )
    AND t.company_id = $1
    ORDER BY t.task_due DESC;`,
    values: [ companyId, dealogicContactId ]
  };

  return db.query(sql);
};

/////////// Gets company tasks created by user
module.exports.getMyCompanyTasks = (userId, companyId, perPage, pageNumber) => {
  let sql = {
    name: 'sel-company-task-mine-paged',
    text: `
    SELECT
        t.task_type, t.task_title, t.task_description, DATE(t.task_due) task_due,
    FROM mzplatform.task t
    WHERE t.task_id IN (
      SELECT task_id FROM mzplatform.task_executor WHERE executor_id = $2
    )
    AND t.company_id = $1
    ORDER BY t.task_due DESC
    LIMIT ${perPage} OFFSET ${ (pageNumber - 1) * perPage };`,
    values: [ companyId, userId ]
  };

  return db.query(sql);
};

/////////// Gets company tasks created by user
module.exports.getMyCompanyTasksFake = (userId, companyId, perPage, pageNumber) => {
  var sql = {
    name: 'sel-company-task-mine-paged',
    text: `
    SELECT
        t.task_id, t.task_title, t.task_type, t.task_description, DATE(t.task_due) task_due,
        t.created_at, t.updated_at, u.name created_by_name
    FROM mzplatform.task t
    JOIN users.mzuser u on u.id = t.created_by
    WHERE t.task_id IN (
      SELECT task_id FROM mzplatform.task_executor WHERE executor_id = $2
    )
    AND t.company_id = $1 AND DATE(t.task_due) = DATE(now())
    ORDER BY t.task_due DESC
    LIMIT ${perPage} OFFSET ${ ( pageNumber - 1 ) * perPage }
    ;`,
    values: [ companyId, userId ]
  };

  return db.query(sql);
};
/////////// Gets company tasks created by user due to today paginated
module.exports.getMyCompanyTasksForToday = (userId, companyId, perPage, pageNumber) => {
  var sql = {
    name: 'sel-company-task-mine-paged-for-today',
    text: `
    SELECT
      t.task_id, t.task_type, t.task_title, t.task_description, DATE(t.task_due) task_due, 
      t.created_at, t.updated_at
    FROM mzplatform.task t
    WHERE t.task_id IN (
      SELECT task_id FROM mzplatform.task_executor WHERE executor_id = $2
    )
    AND t.company_id = $1 AND DATE(t.task_due) = now()::date
    ORDER BY t.task_due DESC
    LIMIT ${perPage} OFFSET ${ ( pageNumber - 1 ) * perPage }
    ;`,
    values: [ companyId, userId ]
  };

  return db.query(sql);
};

/////////// Gets all company tasks paginated
module.exports.getCompanyTasks = (companyId, perPage, pageNumber) => {
  var sql = {
    name: 'sel-company-task-paged',
    text: `
    SELECT
        t.task_id, t.task_title, t.task_type, TO_CHAR(t.task_due,'YYYY-MM-DD') task_due, t.task_description, t.task_origin
    FROM mzplatform.task t
    WHERE t.company_id = $1
    ORDER BY t.task_due DESC
    LIMIT ${perPage} OFFSET ${(pageNumber -1) * perPage}
    ;`,
    values: [ companyId ]
  };
  
  return db.query(sql);
};

/// Returns Company Tasks by Shareholder
module.exports.getCompanyTasksByShareholder = ({ companyId, shareholderId, perPage, pageNumber }) => {
  
  /*
  let sql = `
    SELECT
        t.task_id, 
        t.task_title, 
        t.task_type, 
        TO_CHAR(t.task_due,'YYYY-MM-DD') task_due, 
        t.task_description
    FROM mzplatform.task t
    JOIN mzplatform.task_shareholder ts ON t.task_id = ts.task_id AND ts.shareholder_id = $2
    WHERE t.company_id = $1
    ORDER BY t.task_due DESC
    LIMIT ${perPage} OFFSET ${(pageNumber -1) * perPage}
    ;`;
  
  return db.query(sql, [ companyId, shareholderId ]);


  */
  let sqlTasks = `
  WITH tasks AS (
      SELECT DISTINCT t.task_id, t.task_title, t.task_due, t.task_type, t.task_subtype, t.task_start_date, t.task_origin
      FROM mzplatform.task t
      WHERE t.company_id = $1
      AND     
      (
          -- SHAREHOLDER
          (
              t.task_id IN ( 
                  SELECT ts.task_id FROM mzplatform.task_shareholder ts JOIN mzplatform.task t ON t.task_id = ts.task_id WHERE t.company_id = $1 AND ts.shareholder_id = $2
              )
          )
      )
  )
  select tasks.*,
      (SELECT COUNT(1) FROM mzplatform.task_dealogic_contact tdc WHERE tasks.task_id = tdc.task_id)::int count_dealogic_contacts,
      (SELECT COUNT(1) FROM mzplatform.task_shareholder ts WHERE tasks.task_id = ts.task_id)::int count_shareholders,
      (SELECT COUNT(1) FROM mzplatform.task_contact tc WHERE tasks.task_id = tc.task_id)::int count_contacts,
      (SELECT STRING_AGG(u.name,'#| ') FROM mzplatform.task_executor te JOIN users.mzuser u ON te.executor_id = u.id WHERE tasks.task_id = te.task_id)::varchar executors,
      (SELECT STRING_AGG(tdc.name,'#| ') FROM mzplatform.task_dealogic_contact tdc WHERE tasks.task_id = tdc.task_id)::varchar dealogic_contacts,
      (SELECT STRING_AGG(ts.name,'#| ') FROM mzplatform.task_shareholder ts WHERE tasks.task_id = ts.task_id)::varchar task_shareholders    
  FROM tasks
  ORDER BY task_due DESC
  LIMIT ${perPage} OFFSET ${(pageNumber -1) * perPage};`;
      let values = [ companyId, shareholderId ]
  
      return db.query(sqlTasks, values);
};

/// Returns Company Tasks by Shareholder
module.exports.getCompanyTasksByShareholderGroup = ({ companyId, shareholderGroupId, perPage, pageNumber }) => {
  /*let sql = `
    SELECT
        t.task_id, 
        t.task_title, 
        t.task_type, 
        TO_CHAR(t.task_due,'YYYY-MM-DD') task_due, 
        t.task_description
    FROM mzplatform.task t
    JOIN mzplatform.task_shareholder ts ON t.task_id = ts.task_id AND ts.shareholder_group_id = $2
    WHERE t.company_id = $1
    ORDER BY t.task_due DESC
    LIMIT ${perPage} OFFSET ${(pageNumber -1) * perPage}
    ;`;
  
  return db.query(sql, [ companyId, shareholderGroupId ]);
  */

  let sqlTasks = `
  WITH tasks AS (
      SELECT DISTINCT t.task_id, t.task_title, t.task_due, t.task_type, t.task_subtype, t.task_start_date, t.task_origin, t.mz_task_type, t.mz_task_subtype
      FROM mzplatform.task t
      WHERE t.company_id = $1
      AND     
      (
          -- SHAREHOLDER GROUP
          (
              t.task_id IN ( 
                SELECT ts.task_id FROM mzplatform.task_shareholder ts JOIN mzplatform.task t ON t.task_id = ts.task_id WHERE t.company_id = $1 AND ts.shareholder_group_id = $2
              )
          )
      )
  )
  select tasks.*,
      tt.task_type_id mz_task_type_id, 
      tt.task_type_name mz_task_type_name, 
      ts.task_subtype_id mz_task_subtype_id, 
      ts.task_subtype_name mz_task_subtype_name,
      (SELECT COUNT(1) FROM mzplatform.task_dealogic_contact tdc WHERE tasks.task_id = tdc.task_id)::int count_dealogic_contacts,
      (SELECT COUNT(1) FROM mzplatform.task_shareholder ts WHERE tasks.task_id = ts.task_id)::int count_shareholders,
      (SELECT COUNT(1) FROM mzplatform.task_contact tc WHERE tasks.task_id = tc.task_id)::int count_contacts,
      (SELECT STRING_AGG(u.name,'#| ') FROM mzplatform.task_executor te JOIN users.mzuser u ON te.executor_id = u.id WHERE tasks.task_id = te.task_id)::varchar executors,
      (SELECT STRING_AGG(tdc.name,'#| ') FROM mzplatform.task_dealogic_contact tdc WHERE tasks.task_id = tdc.task_id)::varchar dealogic_contacts,
      (SELECT STRING_AGG(ts.name,'#| ') FROM mzplatform.task_shareholder ts WHERE tasks.task_id = ts.task_id)::varchar task_shareholders    
  FROM tasks
  LEFT JOIN mzplatform.task_type tt
  ON tt.task_type_id = tasks.mz_task_type
  LEFT JOIN mzplatform.task_subtype ts
  ON ts.task_subtype_id = tasks.mz_task_subtype
  ORDER BY task_due DESC
  LIMIT ${perPage} OFFSET ${(pageNumber -1) * perPage};`;
      let values = [ companyId, shareholderGroupId ]
  
      return db.query(sqlTasks, values);
};

/// Returns Company Tasks by Dealogic Institution Id
module.exports.getCompanyTasksByInstitutionId = function({ companyId, dealogicInstitutionId }) {
  let sql = `
    SELECT
        t.task_id, 
        t.task_title, 
        t.task_type, 
        t.task_subtype,
        TO_CHAR(t.task_due,'YYYY-MM-DD') task_due, 
        TO_CHAR(t.task_start_date,'YYYY-MM-DD') task_start_date, 
        tt.task_type_id mz_task_type_id, 
        tt.task_type_name mz_task_type_name, 
        ts.task_subtype_id mz_task_subtype_id, 
        ts.task_subtype_name mz_task_subtype_name,
        t.task_description,
        ti.dealogic_institution_id,
        ti.name,
        ti.country,
        string_agg(c.name || '|#' || c.email_1, ',') task_contacts,
        (SELECT COUNT(1) FROM mzplatform.task_contact tc WHERE t.task_id = tc.task_id)::int count_contacts,
        (SELECT STRING_AGG(u.name,'#| ') FROM mzplatform.task_executor te JOIN users.mzuser u ON te.executor_id = u.id WHERE t.task_id = te.task_id)::varchar executors
    FROM mzplatform.task t
    JOIN mzplatform.task_institution ti ON t.task_id = ti.task_id
    LEFT JOIN mzplatform.task_contact tc ON tc.task_id = t.task_id
    LEFT JOIN mzplatform.contact c ON tc.contact_id = c.id
    LEFT JOIN mzplatform.task_type tt
    ON tt.task_type_id = t.mz_task_type
    LEFT JOIN mzplatform.task_subtype ts
    ON ts.task_subtype_id = t.mz_task_subtype
    WHERE t.company_id = $1 AND ti.dealogic_institution_id = $2
    GROUP BY t.task_id, t.task_title, t.task_type, t.task_subtype, task_due, task_start_date, task_description, dealogic_institution_id, ti.name, ti.country,
    tt.task_type_id, 
    tt.task_type_name, 
    ts.task_subtype_id, 
    ts.task_subtype_name
    ORDER BY t.task_due DESC
    LIMIT 30;`;
  
  return db.query(sql, [ companyId, dealogicInstitutionId ]);
};

/// Returns Company Tasks by Dealogic Fund Id
module.exports.getCompanyTasksByFundId = function({ companyId, dealogicFundId }) {
  let sql = `
    SELECT
        t.task_id, 
        t.task_title, 
        t.task_type, 
        t.task_subtype,
        TO_CHAR(t.task_due,'YYYY-MM-DD') task_due, 
        TO_CHAR(t.task_start_date,'YYYY-MM-DD') task_start_date, 
        t.task_description,
        tf.dealogic_fund_id, 
        tf.name,
        tf.country,
        string_agg(c.name || '|#' || c.email_1, ',') task_contacts, 
        (SELECT COUNT(1) FROM mzplatform.task_contact tc WHERE t.task_id = tc.task_id)::int count_contacts,
        (SELECT STRING_AGG(u.name,'#| ') FROM mzplatform.task_executor te JOIN users.mzuser u ON te.executor_id = u.id WHERE t.task_id = te.task_id)::varchar executors
    FROM mzplatform.task t
    JOIN mzplatform.task_fund tf ON t.task_id = tf.task_id
    LEFT JOIN mzplatform.task_contact tc ON tc.task_id = t.task_id
    LEFT JOIN mzplatform.contact c ON tc.contact_id = c.id
    WHERE t.company_id = $1 AND tf.dealogic_fund_id = $2
    GROUP BY t.task_id, t.task_title, t.task_type, t.task_subtype, task_due, task_start_date, task_description, tf.dealogic_fund_id, tf.name, tf.country
    ORDER BY t.task_due DESC
    LIMIT 30;`;
  
  return db.query(sql, [ companyId, dealogicFundId ]);
};


/////////// Gets all company tasks paginated
module.exports.getCompanyTasksByDealogicContactId = function(companyId, userId, dealogicContactId, perPage, pageNumber) {
  var sql = {
    name: 'sel-company-task-paged-dealogic-contact-id',
    text: `
    SELECT
        t.task_id, t.company_id, t.task_type, t.task_subtype, t.task_title, t.task_description, DATE(t.task_due) task_due, t.task_origin, t.task_start_date,
        (SELECT COUNT(1) FROM mzplatform.task_dealogic_contact tdc WHERE t.task_id = tdc.task_id)::int count_dealogic_contacts,
        (SELECT COUNT(1) FROM mzplatform.task_shareholder ts WHERE t.task_id = ts.task_id)::int count_shareholders,
        (SELECT COUNT(1) FROM mzplatform.task_contact tc WHERE t.task_id = tc.task_id)::int count_contacts,
        (SELECT STRING_AGG(u.name,'#| ') FROM mzplatform.task_executor te JOIN users.mzuser u ON te.executor_id = u.id WHERE t.task_id = te.task_id)::varchar executors,
        (SELECT STRING_AGG(tdc.name,'#| ') FROM mzplatform.task_dealogic_contact tdc WHERE t.task_id = tdc.task_id)::varchar dealogic_contacts,
        (SELECT STRING_AGG(ts.name,'#| ') FROM mzplatform.task_shareholder ts WHERE t.task_id = ts.task_id)::varchar task_shareholders            
    FROM mzplatform.task t
    WHERE t.company_id = $1 AND t.task_id IN (
      SELECT task_id FROM mzplatform.task_contact WHERE contact_id IN ( 
        SELECT id FROM mzplatform.contact WHERE dealogic_investor_contact_id = $2
      )
    ) 
    ORDER BY t.created_at DESC
    LIMIT ${perPage} OFFSET ${(pageNumber-1) * perPage}
    ;`,
    values: [ companyId, dealogicContactId ]
  };

  return db.query(sql);
};


/////////// Gets company tasks by contact id paginated
module.exports.getCompanyTasksByContactId = function(companyId, userId, contactId, perPage, pageNumber){
  return db.query(`
  SELECT
      t.task_id, t.company_id, t.created_by, t.task_type, t.task_subtype, t.task_title, t.task_description, DATE(t.task_due) task_due, t.task_origin, t.task_start_date, tt.task_type_id mz_task_type_id, tt.task_type_name mz_task_type_name, ts.task_subtype_id mz_task_subtype_id, ts.task_subtype_name mz_task_subtype_name,
      (SELECT COUNT(1) FROM mzplatform.task_dealogic_contact tdc WHERE t.task_id = tdc.task_id)::int count_dealogic_contacts,
      (SELECT COUNT(1) FROM mzplatform.task_shareholder ts WHERE t.task_id = ts.task_id)::int count_shareholders,
      (SELECT COUNT(1) FROM mzplatform.task_contact tc WHERE t.task_id = tc.task_id)::int count_contacts,
      (SELECT STRING_AGG(u.name,'#| ') FROM mzplatform.task_executor te JOIN users.mzuser u ON te.executor_id = u.id WHERE t.task_id = te.task_id)::varchar executors,
      (SELECT STRING_AGG(tdc.name,'#| ') FROM mzplatform.task_dealogic_contact tdc WHERE t.task_id = tdc.task_id)::varchar dealogic_contacts,
      (SELECT STRING_AGG(ts.name,'#| ') FROM mzplatform.task_shareholder ts WHERE t.task_id = ts.task_id)::varchar task_shareholders    
  FROM mzplatform.task t
  LEFT JOIN mzplatform.task_type tt
  ON tt.task_type_id = t.mz_task_type
  LEFT JOIN mzplatform.task_subtype ts
  ON ts.task_subtype_id = t.mz_task_subtype
  WHERE t.company_id = $1 AND t.task_id IN (
    SELECT task_id FROM mzplatform.task_contact WHERE contact_id = $2
  ) 
  ORDER BY t.created_at DESC
  LIMIT ${perPage} OFFSET ${(pageNumber -1 ) * perPage};`, [ companyId, contactId ]);
};

/////////// Deletes a company task given its id
module.exports.deleteCompanyTask = (companyId, id) => {
  var sql = {
    name: 'del-company-task-by-id',
    text: `
    DELETE FROM mzplatform.task WHERE task_id = $1 and company_id = $2;`,
    values: [ id, companyId ]
  };

  return db.none(sql);
};

///////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////// CONTACTS ////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////

/////////// Gets a list of company contacts paginated
module.exports.getContactListPaginated = function({ companyId, profileType, searchText, perPage, pageNumber }) {
  searchText = searchText ? `%${searchText}%` : null;

  let sql = {
    text: `
    SELECT id, dealogic_investor_contact_id, name, email_1, company_name, profile_type, *
    FROM mzplatform.contact WHERE 
    company_id = $1
    AND 
    (
      $2::varchar IS NULL OR profile_type = $2
    )
    AND
    (
      $3::varchar IS NULL OR (company_name ILIKE $3 OR name ILIKE $3 OR email_1 ILIKE $3)
    )
    ORDER BY name
    LIMIT ${perPage} OFFSET ${(pageNumber - 1) * perPage}
    ;`,
    values: [ companyId, profileType, searchText ]
  };

  
  return db.query(sql);
};

/////////// Gets a list of company contacts for a shareholder
module.exports.getContactListForShareholder = ({ companyId, shareholderId, perPage, pageNumber }) => {
  let sql = `
    SELECT id, dealogic_investor_contact_id, name, email_1, job_title, profile_picture_url FROM mzplatform.contact WHERE company_id = $1 AND shareholder_id = $2
    ORDER BY name
    LIMIT ${perPage} OFFSET ${(pageNumber - 1) * perPage}
    ;`;

  return db.query(sql, [ companyId, shareholderId ]);
};

/////////// Gets a list of company contacts for a shareholder group
module.exports.getContactListForShareholderGroup = ({ companyId, shareholderGroupId, perPage, pageNumber }) => {
  let sql = `
    SELECT id, dealogic_investor_contact_id, name, email_1, job_title, profile_picture_url FROM mzplatform.contact WHERE company_id = $1 AND shareholder_group_id = $2
    ORDER BY name
    LIMIT ${perPage} OFFSET ${(pageNumber - 1) * perPage}
    ;`;

  return db.query(sql, [ companyId, shareholderGroupId ]);
};

/////////// Gets the notes for a specific dealogic investor contact id
module.exports.getNotesFromDealogicContactId = ({ companyId, dealogicInvestorContactId }) => {
  let sql = `
    SELECT annotations FROM mzplatform.contact WHERE dealogic_investor_contact_id = $2 AND company_id = $1;`;

  return db.query(sql, [ companyId, dealogicInvestorContactId ]);
};

/// Update a note on Delogic investor contact ID
module.exports.updateNoteOnDealogicContactId = (companyId, dealogicInvestorContactId, notes) => {
  return db.none(`UPDATE mzplatform.contact SET annotations = $3 WHERE company_id = $1 AND dealogic_investor_contact_id = $2;`, [ companyId, dealogicInvestorContactId, notes ]);
}

/////////// Filter company contacts for name/email
module.exports.filterContacts = (companyId, searchText) => {
  searchTextWilcard = '%' + searchText + '%';

  var sql = {
    name: 'sel-contacts-search',
    text: `SELECT * FROM mzplatform.contact WHERE company_id = $1 AND (name LIKE $2 OR email_1 = $2 OR email_2 = $2);`,
    values: [ companyId, searchText ]
  };

  return db.query(sql);
}

module.exports.getContactByPublicContactId = ({ companyId, publicContactId }) => {
  var sql = {
    text: `SELECT id FROM mzplatform.contact WHERE company_id = $1 AND public_contact_id = $2;`,
    values: [ companyId, publicContactId ]
  };

  return db.query(sql);
}

module.exports.getPublicContactById = ({ publicContactId }) => {
  var sql = {
    text: `SELECT * FROM mzplatform.public_contact WHERE public_contact_id = $1;`,
    values: [ publicContactId ]
  };

  return db.query(sql);
}

module.exports.favoritePublicContactById = function({ companyId, contactId, publicContactId }) {
  let sql = {
    text: `
    INSERT INTO mzplatform.contact (id, company_id, public_contact_id, dealogic_investor_id, dealogic_investor_contact_id, name, email_1, job_title, company_name, is_mziq)
    SELECT $1, $2, public_contact_id, dealogic_investor_id, dealogic_investor_contact_id, fullname, email, job_title, investor_name,FALSE FROM mzplatform.public_contact WHERE public_contact_id = $3;
    `,
    values: [ contactId, companyId, publicContactId ]
  };

  return db.none(sql);
}

/////////// Gets contact id given a Dealogic Contact Id
module.exports.getContactByDealogicInvestorContactId = (companyId, investorContactId) => {
  var sql = {
    name: 'sel-contacts-by-investor-contact-id',
    text: `SELECT id FROM mzplatform.contact WHERE company_id = $1 AND dealogic_investor_contact_id = $2;`,
    values: [ companyId, investorContactId ]
  };

  return db.query(sql);
}

/// Associates a contact to a Shareholder
module.exports.vinculateContactWithShareholder = ({ companyId, contactId, shareholderId }) => {
  return db.none(`UPDATE mzplatform.contact SET shareholder_id = $3 WHERE company_id = $1 AND id = $2;`, [ companyId, contactId, shareholderId ]);
}

/// Associates a contact to a Shareholder Group
module.exports.vinculateContactWithShareholderGroup = ({ companyId, contactId, shareholderGroupId }) => {
  return db.none(`UPDATE mzplatform.contact SET shareholder_group_id = $3 WHERE company_id = $1 AND id = $2;`, [ companyId, contactId, shareholderGroupId ]);
}

/// Unlinks a contact from a Shareholder
module.exports.unlinkContactWithShareholder = ({ companyId, contactId }) => {
  return db.none(`UPDATE mzplatform.contact SET shareholder_id = NULL WHERE company_id = $1 AND id = $2;`, [ companyId, contactId ]);
}

/// Unlinks a contact from a Shareholder Group
module.exports.unlinkContactWithShareholderGroup = ({ companyId, contactId }) => {
  return db.none(`UPDATE mzplatform.contact SET shareholder_group_id = NULL WHERE company_id = $1 AND id = $2;`, [ companyId, contactId ]);
}

/// Unlinks a contact from a Shareholder Group and Investor
module.exports.unlinkContactWithShareholderGroupAndInvestor = ({ companyId, contactId }) => {
  return db.none(`UPDATE mzplatform.contact SET shareholder_group_id = NULL, dealogic_investor_id = NULL WHERE company_id = $1 AND id = $2;`, [ companyId, contactId ]);
}

/// Associates a contact to a Stakeholer Company Id
module.exports.associateContactWithIRM = (companyId, contactId, stakeholderCompanyId) => {
  return db.none(`UPDATE mzplatform.contact SET stakeholder_company_id = $3 WHERE company_id = $1 AND id = $2`, [ companyId, contactId, stakeholderCompanyId ]);
}

/// Disassociates a contact from Stakeholers
module.exports.disassociateContactWithIRM = (companyId, contactId) => {
  return db.none(`UPDATE mzplatform.contact SET stakeholder_company_id = NULL WHERE company_id = $1 AND id = $2`, [ companyId, contactId ]);
}

/////////// Gets contact details (all fields) given its id
module.exports.deleteContactById = (companyId, contactId) => {
  return db.none(`DELETE FROM mzplatform.contact WHERE company_id = $1 AND id = $2`, [ companyId, contactId ]);
}

////////// Search by Contact Name
module.exports.searchContactByName = (companyId, contactNamePart) => {
  contactNamePart = '%' + contactNamePart + '%';
    return db.query(`SELECT * FROM mzplatform.contact WHERE company_id = $1 AND name LIKE $2;`, [ companyId, contactNamePart ])
}

////////// Search by Contact Email
module.exports.searchContactByEmail = (companyId, email) => {
  return db.query(`SELECT * FROM mzplatform.contact WHERE company_id = $1 AND email_1 = $2;`, [ companyId, email ])
}

////////// Search by Contact Name and Email
module.exports.searchContactByNameAndEmail = (companyId, searchTerm) => {
  searchTerm = '%' + searchTerm.toUpperCase() + '%';
    return db.query(`SELECT * FROM mzplatform.contact WHERE company_id = $1 AND (UPPER(name) LIKE $2 OR UPPER(email_1) LIKE $2);`, [ companyId, searchTerm ])
}

/////////// Gets contact details (all fields) given its id
var getContactById = function(companyId, contactId) {
  return db.task(t => {
    return t.batch([
      t.query(`SELECT * FROM mzplatform.contact WHERE company_id = $1 AND id = $2;`, [ companyId, contactId ]),
      t.query(`SELECT * FROM mzplatform.contact_countries WHERE contact_id = $1;`, [ contactId ]),
      t.query(`SELECT * FROM mzplatform.contact_education WHERE contact_id = $1;`, [ contactId ]),
      t.query(`SELECT * FROM mzplatform.contact_sector WHERE contact_id = $1;`, [ contactId ]),
      t.query(`SELECT * FROM mzplatform.contact_job_function WHERE contact_id =  $1;`, [ contactId ]),
      t.query(`SELECT * FROM mzplatform.contact_phone_number WHERE contact_id = $1;`, [ contactId ]),
      t.query(`SELECT * FROM mzplatform.contact_document WHERE contact_id = $1;`, [ contactId ]),
      t.query(`SELECT * FROM mzplatform.contact_branch WHERE contact_id = $1;`, [ contactId ]),
      t.oneOrNone(`SELECT stakeholder_company_id FROM mzplatform.contact WHERE id = $1;`, [ contactId ])
    ]);
  }).then(data => {
    return {
      details: data[0],
      countries: data[1],
      education: data[2],
      sector: data[3],
      job_functions: data[4],
      phone_numbers: data[5],
      documents: data[6],
      branches: data[7],
      stakeholder_company_id: data[8]
    };
  });
};

const pgp = require('pg-promise');

module.exports.getContactById = getContactById;
module.exports.getContactsById = function({ companyId, dealogicContactIds }) {
  return db.query("SELECT * FROM mzplatform.contact WHERE company_id = $1 AND dealogic_investor_contact_id IN ($2:list);", [ companyId,  dealogicContactIds ]);
};

module.exports.getContactsByIdAndTerm = function({ companyId, dealogicContactIds, searchTerms }) {
  searchText = searchTerms ? `%${searchTerms}%` : null;
  return db.query("SELECT * FROM mzplatform.contact WHERE company_id = $1 AND dealogic_investor_contact_id IN ($2:list) UNION SELECT * FROM mzplatform.contact WHERE company_id = $1 AND (dealogic_investor_contact_id IS NULL OR public_contact_id IS NULL) AND (name ILIKE $3 or email_1 ILIKE $3);", [ companyId,  dealogicContactIds, searchText ]);
};


/////////// Adds a Dealogic contact as company contact
module.exports.addContactFromDealogic = (contact) => {
  let details = contact.details;
  let countries = contact.countries;
  let education = contact.education;
  let sectors = contact.sectors;
  let job_functions = contact.job_functions;
  let phone_numbers = contact.phone_numbers;
  let branches = contact.branches;

  var promises = [];

  var sqlContact = {
    name: 'ins-contacts-by-investor-contact-id',
    text: `INSERT INTO mzplatform.contact(id, company_id, dealogic_investor_id,
                                      dealogic_investor_contact_id, name, biography,
                                      email_1, email_2, job_title, profile_picture_url)
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING "id"
      ;`,
    values: [
      contact.id,
      contact.companyId,
      details.dealogic_investor_id,
      details.dealogic_investor_contact_id,
      details.name,
      details.biography,
      details.email_1,
      details.email_2,
      details.job_title,
      details.picture_url
    ]
  };

  return db.task(t => {
      return t
      .one(sqlContact)
      .then(data => {
          promises.push(branches.map(function(x) {
            let sqlBranch = {
              name: 'ins-dealogic-contact-branch',
              text: `INSERT INTO mzplatform.contact_branch (contact_id, name, address_1, address_2, city, zipcode, country, phone_number, fax_number, website, is_dealogic)
              VALUES ($1, $2, $3,$4,$5,$6,$7,$8,$9,$10,$11);`,
              values: [contact.id, x.name, x.address1, x.address2, x.city, x.zipcode, x.country, x.phone_number, x.fax_number, x.website, true ]
            }
            return db.none(sqlBranch);
          }));

          promises.push(countries.map(function(x) {
            let sqlCountries = {
              name: 'ins-dealogic-contact-countries',
              text: `INSERT INTO mzplatform.contact_countries (contact_id, country_name, is_dealogic)
                      VALUES ($1,$2,$3);`,
              values: [contact.id, x.country_name, true]
            }
            return db.none(sqlCountries);
          }));

          promises.push(education.map(function(x) {
            let sqlEducation = {
              name: 'ins-dealogic-contact-education',
              text: `INSERT INTO mzplatform.contact_education (contact_id, graduation_year, school_name, program, degree_type, is_dealogic)
                    VALUES ($1, $2, $3, $4, $5, $6);`,
              values: [contact.id, x.graduation_year, x.school_name, x.program, x.degree_type, true]
            };
            return db.none(sqlEducation);
          }));

          promises.push(sectors.map(function(x) {
            let sqlSector = {
              name: 'ins-dealogic-contact-sector',
              text: `INSERT INTO mzplatform.contact_sector (contact_id, name, is_dealogic)
                      VALUES ($1,$2,$3);`,
              values: [contact.id, x.sector_name, true]
            }
            return db.none(sqlSector);
          }));

          promises.push(job_functions.map(function(x) {
            let sqlJobFunctions = {
              name: 'ins-dealogic-contact-job-function',
              text: `INSERT INTO mzplatform.contact_job_function (contact_id, name, is_dealogic)
                        VALUES ($1,$2,$3);`,
              values: [contact.id, x.name, true]
            }
            return db.none(sqlJobFunctions);
          }));

          promises.push(phone_numbers.map(function(x) {
            let sqlPhoneNumbers = {
              name: 'ins-dealogic-contact-phone-number',
              text: `INSERT INTO mzplatform.contact_phone_number (contact_id, phone_type, phone_number, is_dealogic)
                          VALUES ($1,$2,$3,$4);`,
              values: [ contact.id, x.phone_type_id, x.phone_number, true ]
            }
            return sqlPhoneNumbers;
          }));

          //Processes/awaits all pending promises
          return t.batch(promises);
    });
  })
};

/////////// Adds Simple Contact
module.exports.addSimpleContact = 
function(id, companyId, name, email_1, email_2, profile_type, phone_number, 
 company_name, job_title, source, annotations, is_mziq, isNew, shareholderId, shareholderGroupId,
 address, city, state, zipcode, country, phone_number_iq, cellphone_number, main_language) {
   return db.tx(t => {
    let queries = [];

    queries.push(t.none(`
    INSERT INTO mzplatform.contact 
    (id, company_id, name, email_1, email_2, profile_type, company_name, job_title, source, annotations, is_mziq, shareholder_id, shareholder_group_id,
    address, city, state, zipcode, country, phone_number, cellphone_number, main_language)
    VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,$19, $20, $21)
    ON CONFLICT (id) DO UPDATE SET 
    name = COALESCE(EXCLUDED.name, contact.name),
    email_1 = COALESCE(EXCLUDED.email_1, contact.email_1),
    email_2 = COALESCE(EXCLUDED.email_2, contact.email_2),
    profile_type = COALESCE(EXCLUDED.profile_type, contact.profile_type),
    company_name = COALESCE(EXCLUDED.company_name, contact.company_name),
    job_title = COALESCE(EXCLUDED.job_title, contact.job_title),
    source = COALESCE(EXCLUDED.source, contact.source),
    annotations = COALESCE(EXCLUDED.annotations, contact.annotations),
    shareholder_id = EXCLUDED.shareholder_id, 
    shareholder_group_id = EXCLUDED.shareholder_group_id,
    address = EXCLUDED.address, 
    city = EXCLUDED.city, 
    state = EXCLUDED.state, 
    zipcode = EXCLUDED.zipcode, 
    country = EXCLUDED.country, 
    phone_number = EXCLUDED.phone_number, 
    cellphone_number = EXCLUDED.cellphone_number,
    main_language = EXCLUDED.main_language;`, 
    [ id, companyId, name, email_1, email_2, profile_type, company_name, job_title, source, annotations, is_mziq, shareholderId, shareholderGroupId,
      address, city, state, zipcode, country, phone_number_iq, cellphone_number, main_language ],
    ));

    if(isNew) {
      queries.push(t.none(`
      INSERT INTO mzplatform.contact_phone_number 
      (contact_id, phone_type, phone_number, is_dealogic)
      VALUES ($1,$2,$3,false);`,[ id, 2, phone_number])); //fixed mobile phone
    }

    return t.batch(queries);
  })
};

/// Updates Contact Business Card Image
module.exports.updateContactBusinessCard = (contactId, businessCardImageUrl) => {
  let sql = {
    text: `UPDATE mzplatform.contact SET business_card_image_url = $2 WHERE id = $1`,
    values: [ contactId, businessCardImageUrl]
  };
  
  return db.none(sql).then(() => businessCardImageUrl);
};

/// Update private contact to vinculate it with InvestorId (This will only work for my contacts)
module.exports.updateContactInvestorId = (companyId, contactId, dealogicInvestorId) => {
  let sql = {
    text: `UPDATE mzplatform.contact SET dealogic_investor_id = $2 WHERE id = $1 and public_contact_id IS NULL and company_id = $3`,
    values: [ contactId, dealogicInvestorId, companyId]
  };
  
  return db.none(sql);
};


/////////// Adds or updates contact's basic information
module.exports.addOrUpdateContactBasicInfo = (contact) => {
  let sqlContact = {
    name: 'ins-contacts-by-investor-contact-id',
    text: `
    INSERT INTO mzplatform.contact(id, company_id, name, biography,
                                      email_1, email_2, job_title,
                                      annotations)
      VALUES($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      biography = EXCLUDED.biography,
      email_1 = EXCLUDED.email_1,
      email_2 = EXCLUDED.email_2,
      job_title = EXCLUDED.job_title,
      updated_at = now()
      ;`,
    values: [
      contact.id,
      contact.companyId,
      contact.name,
      contact.biography,
      contact.email_1,
      contact.email_2,
      contact.job_title
    ]
  };
  return db.none(sqlContact);
};


/////////// Adds or updates contact's branch
module.exports.addUpdateContactBranch = (companyId, contactId, id, name, address1, address2, city, zipcode, country, phoneNumber, faxNumber, website) => {
  let sql = {
    name: 'upsert-contact-branch',
    text: `
    INSERT INTO mzplatform.contact_branch (id, contact_id, name, address_1, address_2, city, zipcode, country, phone_number, fax_number, website)
    VALUES ($1, $2, $3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    address_1 = EXCLUDED.address_1,
    address_2 = EXCLUDED.address_2,
    city = EXCLUDED.city,
    zipcode = EXCLUDED.zipcode,
    country = EXCLUDED.country,
    phone_number = EXCLUDED.phone_number,
    fax_number = EXCLUDED.fax_number,
    website = EXCLUDED.website;`,
    values: [ id, contactId, name, address1, address2, city, zipcode, country, phoneNumber, faxNumber, website ]
  };

  return db.none(sql);
};

/////////// Deletes a contact's branch
module.exports.deleteContactBranch = (companyId, contactId, id) => {
  let sql = {
    name: 'del-contact-branch',
    text: `DELETE FROM mzplatform.contact_branch WHERE contact_id = $1 AND id = $2;`,
    values: [ contactId, id ]
  };

  return db.none(sql);
};

/////////// Adds or updates contact's job function
module.exports.addUpdateContactJobFunction = (companyId, contactId, id, name) => {
  let sql = {
    name: 'upsert-job-function',
    text: `
    INSERT INTO mzplatform.contact_job_function (id, contact_id, name)
    VALUES ($1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name;`,
    values: [ id, contactId, name ]
  };

  return db.none(sql);
};

/////////// Deletes a contact's job function
module.exports.deleteContactJobFunction = (companyId, contactId, id) => {
  let sql = {
    name: 'del-contact-job-function',
    text: `DELETE FROM mzplatform.contact_job_function WHERE contact_id = $1 AND id = $2;`,
    values: [ contactId, id ]
  };

  return db.none(sql);
};


/////////// Adds or updates contact's country
module.exports.addUpdateContactCountry = (companyId, contactId, id, name) => {
  let sql = {
    name: 'upsert-contact-country',
    text: `
    INSERT INTO mzplatform.contact_countries (id, contact_id, name)
    VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name;`,
    values: [ id, contactId, name  ]
  };

  return db.none(sql);
};

/////////// Deletes contact's country
module.exports.deleteContactCountry = (companyId, contactId, id) => {
  let sql = {
    name: 'del-contact-country',
    text: `DELETE FROM mzplatform.contact_countries WHERE contact_id = $1 AND id = $2;`,
    values: [ contactId, id ]
  };

  return db.none(sql);
};

/////////// Adds or updates contact's sector
module.exports.addUpdateContactSector = (companyId, contactId, id, name) => {
  let sql = {
    name: 'upsert-contact-sector',
    text: `
    INSERT INTO mzplatform.contact_sector (id, contact_id, name)
    VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name;`,
    values: [ id, contactId, name ]
  };

  return db.none(sql);
};

/////////// Deletes contact's sector
module.exports.deleteContactSector = (companyId, contactId, id ) => {
  let sql = {
    name: 'del-contact-sector',
    text: `DELETE FROM mzplatform.contact_sector WHERE contact_id = $1 AND id = $2;`,
    values: [ contactId, id ]
  };

  return db.none(sql);
};

/////////// Adds or updates contact's document
module.exports.addUpdateContactDocument = (companyId, contactId, id, document_type, document_number) => {
  let sql = {
    name: 'upsert-contact-document',
    text: `
    INSERT INTO mzplatform.contact_document (id, contact_id, document_type, document_number)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO UPDATE SET
    document_type = EXCLUDED.document_type,
    document_number = EXCLUDED.document_number;`,
    values: [ id, contactId, document_type, document_number  ]
  };

  return db.none(sql);
};

/////////// Deletes contact's document
module.exports.deleteContactDocument = (companyId, contactId, id ) => {
  let sql = {
    name: 'del-contact-document',
    text: `DELETE FROM mzplatform.contact_document WHERE contact_id = $1 AND id = $2;`,
    values: [ contactId, id ]
  };

  return db.none(sql);
};

/////////// Adds or updates contact's phone number
module.exports.addUpdateContactPhoneNumber = (id, contact_id, phone_type, phone_number, is_dealogic) => {
  let sql = {
    name: 'upsert-contact-phone-number',
    text: `
    INSERT INTO mzplatform.contact_phone_number (id, contact_id, phone_type, phone_number, is_dealogic)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET
          phone_type = EXCLUDED.phone_type,
          phone_number = EXCLUDED.phone_number,
          is_dealogic = EXCLUDED.is_dealogic;`,
    values: [ id, contact_id, phone_type, phone_number, is_dealogic ]
  };

  return db.none(sql);
};

/////////// Deletes contact's phone number
module.exports.deleteContactPhoneNumber = (contactId, id ) => {
  let sql = {
    name: 'del-contact-phone-number',
    text: `DELETE FROM mzplatform.contact_phone_number WHERE contact_id = $1 AND id = $2;`,
    values: [ contactId, id ]
  };

  return db.none(sql);
};

/////////// Adds or updates contact's education
module.exports.addUpdateContactEducation = (companyId, contactId, id, graduation_year, school_name, program, degree_type) => {
  let sql = {
    name: 'ins-contact-education',
    text: `INSERT INTO mzplatform.contact_education (id, contact_id, graduation_year, school_name, program, degree_type)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
          graduation_year = EXCLUDED.graduation_year,
          school_name = EXCLUDED.school_name,
          program = EXCLUDED.program,
          degree_type = EXCLUDED.degree_type;`,
    values: [ id, contactId, graduation_year, school_name, program, degree_type  ]
  };

  return db.none(sql);
};

/////////// Deletes contact's education
module.exports.deleteContactEducation = (companyId, contactId, id ) => {
  let sql = {
    name: 'del-contact-education',
    text: `DELETE FROM mzplatform.contact_education WHERE contact_id = $1 AND id = $2;`,
    values: [ contactId, id ]
  };

  return db.none(sql);
};

/// Returns Task Analytics grouped by year/executor for a company in a range of dates
module.exports.getTaskAnalyticsPerExecutorByYear = ({ companyId, initialDate, endDate }) => {
    return db.query(`
    SELECT EXTRACT(YEAR FROM t.task_due) task_year, u.name executor_name, SUM(1) task_total FROM mzplatform.task t 
	JOIN mzplatform.task_executor te ON te.task_id = t.task_id
	JOIN users.mzuser u ON u.id = te.executor_id
	WHERE 
	t.company_id = $1
	AND (t.task_due >= $2 AND t.task_due <= $3)
  GROUP BY task_year, u.name
  ORDER BY task_year ASC, u.name ASC;
  `, [ companyId, initialDate, endDate  ])
}

/// Returns Task Analytics grouped by month/executor for a company in a range of dates
module.exports.getTaskAnalyticsPerExecutorByMonth = ({ companyId, initialDate, endDate }) => {
  return db.query(`
  SELECT  EXTRACT(YEAR FROM t.task_due) || '/' || LPAD(EXTRACT(MONTH FROM t.task_due)::text,2,'0')  task_month, u.name executor_name, SUM(1) task_total FROM mzplatform.task t
JOIN mzplatform.task_executor te ON te.task_id = t.task_id
JOIN users.mzuser u ON u.id = te.executor_id
WHERE 
t.company_id = $1
AND (t.task_due >= $2 AND t.task_due <= $3)
GROUP BY task_month, u.name
ORDER BY task_month ASC, u.name ASC;
`, [ companyId, initialDate, endDate ])
}

/// Returns Task Analytics grouped by executor for a company in a range of dates
module.exports.getTaskAnalyticsPerExecutorByTotals = ({ companyId, initialDate, endDate }) => {
  return db.query(`
  SELECT u.name executor_name, SUM(1) task_total FROM mzplatform.task t
    JOIN mzplatform.task_executor te ON te.task_id = t.task_id
    JOIN users.mzuser u ON u.id = te.executor_id
    WHERE 
      t.company_id = $1
      AND (t.task_due >= $2 AND t.task_due <= $3)
      GROUP BY u.name
	    ORDER BY u.name ASC;
`, [ companyId, initialDate, endDate ])
}

/// Returns Task Analytics grouped by year/type for a company in a range of dates
module.exports.getTaskAnalyticsPerTypeByYear = ({ companyId, initialDate, endDate }) => {
  return db.query(`
  SELECT EXTRACT(YEAR FROM t.task_due) task_year, task_type_name task_type, SUM(1) task_total 
  FROM mzplatform.task t 
  INNER JOIN mzplatform.task_type tt
  on tt.task_type_id = t.mz_task_type
  WHERE 
  t.company_id = $1
  AND (t.task_due >= $2 AND t.task_due <= $3)
  GROUP BY task_year, task_type_name
  ORDER BY task_year;
`, [ companyId, initialDate, endDate  ])
}

/// Returns Task Analytics grouped by month/type for a company in a range of dates
module.exports.getTaskAnalyticsPerTypeByMonth = ({ companyId, initialDate, endDate }) => {
return db.query(`
SELECT  EXTRACT(YEAR FROM t.task_due) || '/' || LPAD(EXTRACT(MONTH FROM t.task_due)::text,2,'0') task_month, task_type_name task_type, SUM(1) task_total 
FROM mzplatform.task t
INNER JOIN mzplatform.task_type tt
on tt.task_type_id = t.mz_task_type
WHERE 
t.company_id = $1
AND (t.task_due >= $2 AND t.task_due <= $3)
GROUP BY task_month, task_type_name
ORDER BY task_month;
`, [ companyId, initialDate, endDate ])
}

/// Returns Task Analytics grouped by type for a company in a range of dates
module.exports.getTaskAnalyticsPerTypeByTotals = ({ companyId, initialDate, endDate }) => {
  return db.query(`
  SELECT task_type_name task_type, SUM(1) task_total 
  FROM mzplatform.task t 
  INNER JOIN mzplatform.task_type tt
  on tt.task_type_id = t.mz_task_type
	WHERE 
	t.company_id = $1
	AND (t.task_due >= $2 AND t.task_due <= $3)
	GROUP BY task_type_name
	ORDER BY task_type_name ASC;
`, [ companyId, initialDate, endDate ])
}