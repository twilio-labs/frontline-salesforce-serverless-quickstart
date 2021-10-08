const sfdcAuthenticatePath = Runtime.getFunctions()['auth/sfdc-authenticate'].path;
const { sfdcAuthenticate } = require(sfdcAuthenticatePath);

exports.handler = async function (context, event, callback) {
  let response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');
  try {
    console.log('Frontline user identity: ' + event.Worker);
    if (event.Anchor) { // workaround to avoid pagination
      response.setBody([]);
      return callback(null, response);
    } else {
      const connection = await sfdcAuthenticate(context, event.Worker);
      const identityInfo = await connection.identity();
      console.log('Connected as SF user:' + identityInfo.username);
      switch (event.Location) {
        case 'GetCustomerDetailsByCustomerId': {
          response.setBody(
            await getCustomerDetailsByCustomerIdCallback(
              event.CustomerId,
              connection)
          );
          break;
        }
        case 'GetCustomersList': {
          response.setBody(
            await getCustomersListCallback(
              //event.PageSize, // not currently handling pagination
              event.Worker,
              connection)
          );
          break;
        }
        default: {
          console.log('Unknown Location: ', event.Location);
          res.setStatusCode(422);
        }
      }
      return callback(null, response);
    } 
  } catch (e) {
    console.error(e);
    response.setStatusCode(500);
    return callback(null, response);
  }
};

const getCustomerDetailsByCustomerIdCallback = async (contactId, connection) => {
  console.log('Getting Customer details: ', contactId);
  let sfdcRecords = [];
  try {
    sfdcRecords = await connection.sobject("Contact")
      .find(
        {
          'Id': contactId
        },
        {
          Id: 1,
          Name: 1,
          Title: 1,
          MobilePhone: 1,
          'Account.Name': 1,
        }
      )
      .limit(1)
      .execute();
    console.log("Fetched # SFDC records for customer details by ID: " + sfdcRecords.length);
  } catch (err) {
    console.error(err);
  }
  const sfdcRecord = sfdcRecords[0];

  const accountName = (
    sfdcRecord.Account ? sfdcRecord.Account.Name : 'Unknown Company'
  );

  return {
    objects: {
      customer: {
        customer_id: sfdcRecord.Id,
        display_name: sfdcRecord.Name,
        channels: [
          {
            type: 'sms',
            value: sfdcRecord.MobilePhone
          },
          {
            type: 'whatsapp',
            value: `whatsapp:${sfdcRecord.MobilePhone}`
          },
          {
            type: 'email',
            value: sfdcRecord.Email
          }
        ],
        details: {
          title: "Information",
          content: `${accountName} - ${sfdcRecord.Title}`
        }
      }
    }
  }
};

const getCustomersListCallback = async (workerIdentity, connection) => {
  let sfdcRecords = [];
  try {
    sfdcRecords = await connection.sobject("Contact")
      .find(
        {
          'Owner.Username': workerIdentity
        },
        {
          Id: 1,
          Name: 1,
        }
      )
      .sort({ Name: 1 })
      .limit(2000)
      .execute();
    console.log("Fetched # SFDC records for customers list: " + sfdcRecords.length);
  } catch (err) {
    console.error(err);
  }

  const list = sfdcRecords.map(contact => ({
    display_name: contact.Name,
    customer_id: contact.Id
  }));

  return {
    objects:
    {
      customers: list
    }
  };
};