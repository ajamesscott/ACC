/*------------------------------------------------------------------------------------------------------/
| Accela Automation
| Accela, Inc.
| Copyright (C): 2012
|
| Program : INCLUDES_CUSTOM.js
| Event   : N/A
|
| Usage   : Custom Script Include.  Insert custom EMSE Function below and they will be 
|	    available to all master scripts
|
| Notes   :
|
/------------------------------------------------------------------------------------------------------*/


// fixes issue in 2.0 distribution

function endBranch() {
	// stop execution of the current std choice
	stopBranch = true;
	}
	
	
// custom changes to this function, used in workflow task update after
	
function createPublicUserFromContact()   // optional: Contact Type, default Applicant
{
	var contactType = "Appellant";
    var contact;
    if (arguments.length > 0) contactType = arguments[0]; // use contact type specified

    var capContactResult = aa.people.getCapContactByCapID(capId);
    if (capContactResult.getSuccess()) {
		var Contacts = capContactResult.getOutput();
        for (yy in Contacts) {
            aa.print(Contacts[yy].getCapContactModel().getPeople().getContactType())
            if (contactType.equals(Contacts[yy].getCapContactModel().getPeople().getContactType()))
				contact = Contacts[yy];
        }
    }
    
    if (!contact)
    { logDebug("Couldn't create public user for " + contactType + ", no such contact"); return false; }

	aa.print(contact.getEmail());
    if (!contact.getEmail())
    { logDebug("Couldn't create public user for " + contactType + ", no email address"); return false; }

    // check if exists already
    var getUserResult = aa.publicUser.getPublicUserByEmail(contact.getEmail())
    if (getUserResult.getSuccess()) {
        var userModel = getUserResult.getOutput()
        aa.print("found the user already");
        if (userModel) return userModel;  // send back the existing user
    }

    // create a new one
    var publicUser = aa.publicUser.getPublicUserModel();
    publicUser.setFirstName(contact.getFirstName());
    publicUser.setLastName(contact.getLastName());
    publicUser.setEmail(contact.getEmail());
    publicUser.setUserID(contact.getEmail());
    publicUser.setPassword("e8248cbe79a288ffec75d7300ad2e07172f487f6"); //password : 1111111111
    publicUser.setAuditID("PublicUser");
    publicUser.setAuditStatus("A");
    publicUser.setCellPhone(contact.getCapContactModel().getPeople().getPhone2());

    var result = aa.publicUser.createPublicUser(publicUser);
    if (result.getSuccess()) {
	
        logDebug("Created public user " + contact.getEmail() + "  sucessfully.");
        var userSeqNum = result.getOutput();
        var userModel = aa.publicUser.getPublicUser(userSeqNum).getOutput()

        // create for agency
        aa.publicUser.createPublicUserForAgency(userModel);

        // activate for agency
        var userPinBiz = aa.proxyInvoker.newInstance("com.accela.pa.pin.UserPINBusiness").getOutput()
		userPinBiz.updateActiveStatusAndLicenseIssueDate4PublicUser(servProvCode,userSeqNum,"ADMIN");
		
		// reset password
		var resetPasswordResult = aa.publicUser.resetPassword(contact.getEmail());
		if (resetPasswordResult.getSuccess()) {
			var resetPassword = resetPasswordResult.getOutput();
			userModel.setPassword(resetPassword);
			logDebug("Reset password for " + contact.getEmail() + "  sucessfully.");
		} else {
			logDebug("**ERROR: Reset password for  " + contact.getEmail() + "  failure:" + resetPasswordResult.getErrorMessage());
		}

        // send Activate email
        aa.publicUser.sendActivateEmail(userModel, true, true);

        // send another email
        aa.publicUser.sendPasswordEmail(userModel);
		
        return userModel;
    }
    else {
        logDebug("**Warning creating public user " + contact.getEmail() + "  failure: " + result.getErrorMessage()); return null;
    }
}



function createRefContactsFromCapContactsAndLink(pCapId, contactTypeArray, ignoreAttributeArray, replaceCapContact, overwriteRefContact, refContactExists)
	{

	// contactTypeArray is either null (all), or an array or contact types to process
	//
	// ignoreAttributeArray is either null (none), or an array of attributes to ignore when creating a REF contact
	//
	// replaceCapContact not implemented yet
	//
	// overwriteRefContact -- if true, will refresh linked ref contact with CAP contact data
	//
	// refContactExists is a function for REF contact comparisons.
	//
	var ingoreArray = new Array();
	if (arguments.length > 1) ignoreArray = arguments[1];

	var c = aa.people.getCapContactByCapID(pCapId).getOutput()
	var cCopy = aa.people.getCapContactByCapID(pCapId).getOutput()  // must have two working datasets

	for (var i in c)
	   {
	   var con = c[i];

	   var p = con.getPeople();
	   
	   if (contactTypeArray && !exists(p.getContactType(),contactTypeArray))
		continue;  // not in the contact type list.  Move along.

	   
	   var refContactNum = con.getCapContactModel().getRefContactNumber();
	   if (refContactNum)  // This is a reference contact.   Let's refresh or overwrite as requested in parms.
	   	{
	   	if (overwriteRefContact)
	   		{
	   		p.setContactSeqNumber(refContactNum);  // set the ref seq# to refresh
	   		
	   		
	   						var a = p.getAttributes();
			
							if (a)
								{
								var ai = a.iterator();
								while (ai.hasNext())
									{
									var xx = ai.next();
									xx.setContactNo(refContactNum);
									}
					}
					
					
					
	   		var r = aa.people.editPeopleWithAttribute(p,p.getAttributes());
	   		
			if (!r.getSuccess()) 
				logDebug("WARNING: couldn't refresh reference people : " + r.getErrorMessage()); 
			else
				logDebug("Successfully refreshed ref contact #" + refContactNum + " with CAP contact data"); 
				return refContactNum;
			}
			
	   	if (replaceCapContact)
	   		{
				// To Be Implemented later.   Is there a use case?
			}
			
	   	}
	   	else  // user entered the contact freehand.   Let's create or link to ref contact.
	   	{
			var ccmSeq = p.getContactSeqNumber();

			var existingContact = refContactExists(p);  // Call the custom function to see if the REF contact exists

			var p = cCopy[i].getPeople();  // get a fresh version, had to mangle the first for the search

			if (existingContact)  // we found a match with our custom function.  Use this one.
				{
					refPeopleId = existingContact;
				}
			else  // did not find a match, let's create one
				{

				var a = p.getAttributes();

				if (a)
					{
					//
					// Clear unwanted attributes
					var ai = a.iterator();
					while (ai.hasNext())
						{
						var xx = ai.next();
						if (ignoreAttributeArray && exists(xx.getAttributeName().toUpperCase(),ignoreAttributeArray))
							ai.remove();
						}
					}

				var r = aa.people.createPeopleWithAttribute(p,a);

				if (!r.getSuccess())
					{logDebug("WARNING: couldn't create reference people : " + r.getErrorMessage()); continue; }

				//
				// createPeople is nice and updates the sequence number to the ref seq
				//

				var p = cCopy[i].getPeople();
				var refPeopleId = p.getContactSeqNumber();

				logDebug("Successfully created reference contact #" + refPeopleId);
				}

			//
			// now that we have the reference Id, we can link back to reference
			//

		    var ccm = aa.people.getCapContactByPK(pCapId,ccmSeq).getOutput().getCapContactModel();

		    ccm.setRefContactNumber(refPeopleId);
		    r = aa.people.editCapContact(ccm);

		    if (!r.getSuccess())
				{ logDebug("WARNING: error updating cap contact model : " + r.getErrorMessage()); }
			else
				{ logDebug("Successfully linked ref contact " + refPeopleId + " to cap contact " + ccmSeq);
				return refPeopleId;}


	    }  // end if user hand entered contact 
	}  // end for each CAP contact
} // end function


function createReferenceLP(rlpId,rlpType,pContactType)
	{
	//Creates/updates a reference licensed prof from a Contact and then adds as an LP on the cap.
	var updating = false;
	var capContResult = aa.people.getCapContactByCapID(capId);
	if (capContResult.getSuccess())
		{ conArr = capContResult.getOutput();  }
	else
		{
		logDebug ("**ERROR: getting cap contact: " + capAddResult.getErrorMessage());
		return false;
		}

	if (!conArr.length)
		{
		logDebug ("**WARNING: No contact available");
		return false;
		}


	var newLic = getRefLicenseProf(rlpId)

	if (newLic)
		{
		updating = true;
		logDebug("Updating existing Ref Lic Prof : " + rlpId);
		}
	else
		var newLic = aa.licenseScript.createLicenseScriptModel();

	//get contact record
	if (pContactType==null)
		var cont = conArr[0]; //if no contact type specified, use first contact
	else
		{
		var contFound = false;
		for (yy in conArr)
			{
			if (pContactType.equals(conArr[yy].getCapContactModel().getPeople().getContactType()))
				{
				cont = conArr[yy];
				contFound = true;
				break;
				}
			}
		if (!contFound)
			{
			logDebug ("**WARNING: No Contact found of type: "+pContactType);
			return false;
			}
		}

	peop = cont.getPeople();
	addr = peop.getCompactAddress();

	newLic.setContactFirstName(cont.getFirstName());
	//newLic.setContactMiddleName(cont.getMiddleName());  //method not available
	newLic.setContactLastName(cont.getLastName());
	newLic.setBusinessName(peop.getBusinessName());
	newLic.setAddress1(addr.getAddressLine1());
	newLic.setAddress2(addr.getAddressLine2());
	newLic.setAddress3(addr.getAddressLine3());
	newLic.setCity(addr.getCity());
	newLic.setState(addr.getState());
	newLic.setZip(addr.getZip());
	newLic.setPhone1(peop.getPhone1());
	newLic.setPhone2(peop.getPhone2());
	newLic.setEMailAddress(peop.getEmail());
	newLic.setFax(peop.getFax());

	newLic.setAgencyCode(aa.getServiceProviderCode());
	newLic.setAuditDate(sysDate);
	newLic.setAuditID(currentUserID);
	newLic.setAuditStatus("A");

	if (AInfo["Insurance Co"]) 		newLic.setInsuranceCo(AInfo["Insurance Co"]);
	if (AInfo["Insurance Amount"]) 		newLic.setInsuranceAmount(parseFloat(AInfo["Insurance Amount"]));
	if (AInfo["Insurance Exp Date"]) 	newLic.setInsuranceExpDate(aa.date.parseDate(AInfo["Insurance Exp Date"]));
	if (AInfo["Policy #"]) 			newLic.setPolicy(AInfo["Policy #"]);

	if (AInfo["Business License #"]) 	newLic.setBusinessLicense(AInfo["Business License #"]);
	if (AInfo["Business License Exp Date"]) newLic.setBusinessLicExpDate(aa.date.parseDate(AInfo["Business License Exp Date"]));

	newLic.setLicenseType(rlpType);
	newLic.setLicState(addr.getState());
	newLic.setStateLicense(rlpId);

	if (updating)
		myResult = aa.licenseScript.editRefLicenseProf(newLic);
	else
		myResult = aa.licenseScript.createRefLicenseProf(newLic);

	if (!myResult.getSuccess())
		{
		logDebug("**ERROR: can't create ref lic prof: " + myResult.getErrorMessage());
		return null;
		}

	logDebug("Successfully added/updated License No. " + rlpId + ", Type: " + rlpType + " Sequence Number " + myResult.getOutput());

	lpsmResult = aa.licenseScript.getRefLicenseProfBySeqNbr(servProvCode,myResult.getOutput())
	if (!lpsmResult.getSuccess())
		{ logDebug("**WARNING error retrieving the LP just created " + lpsmResult.getErrorMessage()) ; return null}

	lpsm = lpsmResult.getOutput();

	// Now add the LP to the CAP
	asCapResult= aa.licenseScript.associateLpWithCap(capId,lpsm)
	if (!asCapResult.getSuccess())
		{ logDebug("**WARNING error associating CAP to LP: " + asCapResult.getErrorMessage()) }
	else
		{ logDebug("Associated the CAP to the new LP") }


	// Find the public user by co406ntact email address and attach
	puResult = aa.publicUser.getPublicUserByEmail(peop.getEmail())
	if (!puResult.getSuccess())
		{ logDebug("**WARNING finding public user via email address " + peop.getEmail() + " error: " + puResult.getErrorMessage()) }
	else
		{
		pu = puResult.getOutput();
		asResult = aa.licenseScript.associateLpWithPublicUser(pu,lpsm)
		if (!asResult.getSuccess())
			{logDebug("**WARNING error associating LP with Public User : " + asResult.getErrorMessage());}
		else
			{logDebug("Associated LP with public user " + peop.getEmail()) }
		}

	return lpsm;
	}

function getParentLicenseCapID(capid)
{
	if (capid == null || aa.util.instanceOfString(capid))
	{
		return null;
	}
	var workingCapID = capid // use the cap id.  if this is ACA we will get the EST cap
	var result = aa.cap.getProjectByChildCapID(capid, "EST", null);
    if(result.getSuccess())
	{
		projectScriptModels = result.getOutput();
		if (projectScriptModels == null || projectScriptModels.length == 0)
		{
			logDebug("**ERROR: Failed to get partial CAP with CAPID(" + capid + ")");
			return null;
		}
		//2. Get original partial CAP ID from project Model
		projectScriptModel = projectScriptModels[0];
		workingCapID = projectScriptModel.getProjectID();
	}

	//3. Get parent license CAPID from renewal CAP table
	var result2 = aa.cap.getProjectByChildCapID(workingCapID, "Renewal", null);
	if(result2.getSuccess())
		{
			licenseProjects = result2.getOutput();
			if (licenseProjects == null || licenseProjects.length == 0)
			{
				logDebug("**ERROR: Failed to get parent CAP with partial CAPID(" + workingCapID + ")");
				return null;
			}
			licenseProject = licenseProjects[0];
			//4. Return parent license CAP ID.
			return licenseProject.getProjectID();
		}
    else
		{
		  logDebug("**ERROR: Failed to get partial CAP by child CAP(" + workingCapID + "): " + result2.getErrorMessage());
		  return null;
		}
}

function getRefLicenseProf_mod(refstlic,rlpType)
{
	var refLicObj = null;
	var refLicenseResult = aa.licenseScript.getRefLicensesProfByLicNbr(aa.getServiceProviderCode(),refstlic);
	if (!refLicenseResult.getSuccess())
		{ logDebug("**ERROR retrieving Ref Lic Profs : " + refLicenseResult.getErrorMessage()); return false; }
	else
	{
		var newLicArray = refLicenseResult.getOutput();
		if (!newLicArray) return null;
		for (var thisLic in newLicArray)
		{
			if (refstlic && refstlic.toUpperCase().equals(newLicArray[thisLic].getStateLicense().toUpperCase()) && rlpType.toUpperCase().equals(newLicArray[thisLic].getLicenseType().toUpperCase()))
				refLicObj = newLicArray[thisLic];
		}
	}

	return refLicObj;
}

function createReferenceLP_mod(rlpId,rlpType,pContactType)
	{
	//Creates/updates a reference licensed prof from a Contact and then adds as an LP on the cap.
	var updating = false;
	var capContResult = aa.people.getCapContactByCapID(capId);
	if (capContResult.getSuccess())
		{ conArr = capContResult.getOutput();  }
	else
		{
		logDebug ("**ERROR: getting cap contact: " + capAddResult.getErrorMessage());
		return false;
		}

	if (!conArr.length)
		{
		logDebug ("**WARNING: No contact available");
		return false;
		}


	var newLic = getRefLicenseProf_mod(rlpId,rlpType)

	if (newLic)
		{
		updating = true;
		logDebug("Updating existing Ref Lic Prof : " + rlpId);
		}
	else
		{
		logDebug("Creating new Ref Lic Prof : " + rlpId);
		var newLic = aa.licenseScript.createLicenseScriptModel();
		}

	//get contact record
	if (pContactType==null)
		var cont = conArr[0]; //if no contact type specified, use first contact
	else
		{
		var contFound = false;
		for (yy in conArr)
			{
			if (pContactType.equals(conArr[yy].getCapContactModel().getPeople().getContactType()))
				{
				cont = conArr[yy];
				contFound = true;
				break;
				}
			}
		if (!contFound)
			{
			logDebug ("**WARNING: No Contact found of type: "+pContactType);
			return false;
			}
		}

	peop = cont.getPeople();
	addr = peop.getCompactAddress();
	profSeq = null;
	
	newLic.setContactFirstName(cont.getFirstName());
	//newLic.setContactMiddleName(cont.getMiddleName());  //method not available
	newLic.setContactLastName(cont.getLastName());
	newLic.setBusinessName(peop.getBusinessName());
	newLic.setAddress1(addr.getAddressLine1());
	newLic.setAddress2(addr.getAddressLine2());
	newLic.setAddress3(addr.getAddressLine3());
	newLic.setCity(addr.getCity());
	newLic.setState(addr.getState());
	newLic.setZip(addr.getZip());
	newLic.setPhone1(peop.getPhone1());
	newLic.setPhone2(peop.getPhone2());
	newLic.setEMailAddress(peop.getEmail());
	newLic.setFax(peop.getFax());

	newLic.setAgencyCode(aa.getServiceProviderCode());
	newLic.setAuditDate(sysDate);
	newLic.setAuditID(currentUserID);
	newLic.setAuditStatus("A");

	if (AInfo["Insurance Co"]) 		newLic.setInsuranceCo(AInfo["Insurance Co"]);
	if (AInfo["Insurance Amount"]) 		newLic.setInsuranceAmount(parseFloat(AInfo["Insurance Amount"]));
	if (AInfo["Insurance Exp Date"]) 	newLic.setInsuranceExpDate(aa.date.parseDate(AInfo["Insurance Exp Date"]));
	if (AInfo["Policy #"]) 			newLic.setPolicy(AInfo["Policy #"]);

	if (AInfo["Business License #"]) 	newLic.setBusinessLicense(AInfo["Business License #"]);
	if (AInfo["Business License Exp Date"]) newLic.setBusinessLicExpDate(aa.date.parseDate(AInfo["Business License Exp Date"]));

	newLic.setLicenseType(rlpType);
	newLic.setLicState(addr.getState());
	newLic.setStateLicense(rlpId);

	if (updating)
	{
		profSeq = newLic.getLicSeqNbr();
		myResult = aa.licenseScript.editRefLicenseProf(newLic);
	}
	else
	{
		myResult = aa.licenseScript.createRefLicenseProf(newLic);
		profSeq = newLic.getLicSeqNbr();
	}

	if (!myResult.getSuccess())
		{
		logDebug("**ERROR: can't create ref lic prof: " + myResult.getErrorMessage());
		return null;
		}

	logDebug("Successfully added/updated License No. " + rlpId + ", Type: " + rlpType + " Sequence Number " + profSeq);

	lpsmResult = aa.licenseScript.getRefLicenseProfBySeqNbr(servProvCode,profSeq)
	if (!lpsmResult.getSuccess())
		{ logDebug("**WARNING error retrieving the LP just created " + lpsmResult.getErrorMessage()) ; return null}

	lpsm = lpsmResult.getOutput();

	//get existing LP from CAP
	var capLps = getLicenseProfessional(capId);
	logDebug("getLicP Function output: "+capLps);
	var isPrimary = false;
	if (capLps != null)
	{
		for (var thisCapLpNum in capLps)
		{
			if (capLps[thisCapLpNum].getLicenseNbr().equals(rlpId) && capLps[thisCapLpNum].getLicenseType().equals(rlpType))
			{
				var thisCapLp = capLps[thisCapLpNum];
				if (thisCapLp.getPrintFlag() == "Y")
				{
					logDebug("...remove primary status...");
					isPrimary = true;
					thisCapLp.setPrintFlag("N");
					aa.licenseProfessional.editLicensedProfessional(thisCapLp);
				}

				//need to remove existing LP from CAP
				var remCapLPResult = aa.licenseProfessional.removeLicensedProfessional(thisCapLp);
				if (remCapLPResult.getSuccess())
					logDebug("...Successfully removed existing CAP LP."); 
				else
					logDebug("**WARNING removing lic prof: " + remCapLPResult.getErrorMessage());
			}
		}
	}
	
	// Now add the updated LP to the CAP
	asCapResult= aa.licenseScript.associateLpWithCap(capId,lpsm)
	if (!asCapResult.getSuccess())
		{ logDebug("**WARNING error associating CAP to LP: " + asCapResult.getErrorMessage()) }
	else
		{ logDebug("Associated the modified LP to the CAP") }


	// Find the public user by co406ntact email address and attach
	puResult = aa.publicUser.getPublicUserByEmail(peop.getEmail())
	if (!puResult.getSuccess())
		{ logDebug("**WARNING finding public user via email address " + peop.getEmail() + " error: " + puResult.getErrorMessage()) }
	else
		{
		pu = puResult.getOutput();
		asResult = aa.licenseScript.associateLpWithPublicUser(pu,lpsm)
		if (!asResult.getSuccess())
			{logDebug("**WARNING error associating LP with Public User : " + asResult.getErrorMessage());}
		else
			{logDebug("Associated LP with public user " + peop.getEmail()) }
		}

	return lpsm;
}
function licenseObject_mod(licnumber,rlpType)  // optional renewal Cap ID -- uses the expiration on the renewal CAP.
	{
	itemCap = capId;
	if (arguments.length == 3) itemCap = arguments[2]; // use cap ID specified in args


	this.refProf = null;		// licenseScriptModel (reference licensed professional)
	this.b1Exp = null;		// b1Expiration record (renewal status on application)
	this.b1ExpDate = null;
	this.b1ExpCode = null;
	this.b1Status = null;
	this.refExpDate = null;
	this.licNum = licnumber;	// License Number


	// Load the reference License Professional if we're linking the two
	if (licnumber) // we're linking
		{
		var newLic = getRefLicenseProf_mod(licnumber,rlpType)
		if (newLic)
				{
				this.refProf = newLic;
				tmpDate = newLic.getLicenseExpirationDate();
				if (tmpDate)
						this.refExpDate = tmpDate.getMonth() + "/" + tmpDate.getDayOfMonth() + "/" + tmpDate.getYear();
				logDebug("Loaded reference license professional with Expiration of " + this.refExpDate);
				}
		}

   	// Load the renewal info (B1 Expiration)

   	b1ExpResult = aa.expiration.getLicensesByCapID(itemCap)
   		if (b1ExpResult.getSuccess())
   			{
   			this.b1Exp = b1ExpResult.getOutput();
			tmpDate = this.b1Exp.getExpDate();
			if (tmpDate)
				this.b1ExpDate = tmpDate.getMonth() + "/" + tmpDate.getDayOfMonth() + "/" + tmpDate.getYear();
			this.b1Status = this.b1Exp.getExpStatus();
			logDebug("Found renewal record of status : " + this.b1Status + ", Expires on " + this.b1ExpDate);
			}
		else
			{ logDebug("**ERROR: Getting B1Expiration Object for Cap.  Reason is: " + b1ExpResult.getErrorType() + ":" + b1ExpResult.getErrorMessage()) ; return false }


   	this.setExpiration = function(expDate)
   		// Update expiration date
   		{
   		var expAADate = aa.date.parseDate(expDate);

   		if (this.refProf) {
   			this.refProf.setLicenseExpirationDate(expAADate);
   			aa.licenseScript.editRefLicenseProf(this.refProf);
   			logDebug("Updated reference license expiration to " + expDate); }

   		if (this.b1Exp)  {
 				this.b1Exp.setExpDate(expAADate);
				aa.expiration.editB1Expiration(this.b1Exp.getB1Expiration());
				logDebug("Updated renewal to " + expDate); }
   		}

	this.setIssued = function(expDate)
		// Update Issued date
		{
		var expAADate = aa.date.parseDate(expDate);

		if (this.refProf) {
			this.refProf.setLicenseIssueDate(expAADate);
			aa.licenseScript.editRefLicenseProf(this.refProf);
			logDebug("Updated reference license issued to " + expDate); }

		}
	this.setLastRenewal = function(expDate)
		// Update expiration date
		{
		var expAADate = aa.date.parseDate(expDate)

		if (this.refProf) {
			this.refProf.setLicenseLastRenewalDate(expAADate);
			aa.licenseScript.editRefLicenseProf(this.refProf);
			logDebug("Updated reference license issued to " + expDate); }
		}

	this.setStatus = function(licStat)
		// Update expiration status
		{
		if (this.b1Exp)  {
			this.b1Exp.setExpStatus(licStat);
			aa.expiration.editB1Expiration(this.b1Exp.getB1Expiration());
			logDebug("Updated renewal to status " + licStat); }
		}

	this.getStatus = function()
		// Get Expiration Status
		{
		if (this.b1Exp) {
			return this.b1Exp.getExpStatus();
			}
		}

	this.getCode = function()
		// Get Expiration Status
		{
		if (this.b1Exp) {
			return this.b1Exp.getExpCode();
			}
		}
	}

function associateLPtoCap(rlpId,rlpType) //optional capId to associate
{
	if (arguments.length == 3) 
		capId = arguments[2]; // use cap ID specified in args
	
	//get existing LP from CAP
	var capLps = getLicenseProfessional(capId);

	var isPrimary = false;
	if (capLps != null)
	{
		for (var thisCapLpNum in capLps)
		{
			if (capLps[thisCapLpNum].getLicenseNbr().equals(rlpId) && capLps[thisCapLpNum].getLicenseType().equals(rlpType))
			{
				var thisCapLp = capLps[thisCapLpNum];
				if (thisCapLp.getPrintFlag() == "Y")
				{
					logDebug("...remove primary status...");
					isPrimary = true;
					thisCapLp.setPrintFlag("N");
					aa.licenseProfessional.editLicensedProfessional(thisCapLp);
				}

				//need to remove existing LP from CAP
				var remCapLPResult = aa.licenseProfessional.removeLicensedProfessional(thisCapLp);
				if (remCapLPResult.getSuccess())
					logDebug("...Successfully removed existing CAP LP."); 
				else
					logDebug("**WARNING removing lic prof: " + remCapLPResult.getErrorMessage());
			}
		}
	}
	// Now add the updated LP to the CAP
	lpsm = getRefLicenseProf_mod(rlpId,rlpType ); 
	if (!lpsm)
		{ logDebug("WARNING error retrieving the LP") ; return null}

	asCapResult= aa.licenseScript.associateLpWithCap(capId,lpsm);
	if (!asCapResult.getSuccess())
		logDebug("**WARNING error associating CAP to LP: " + asCapResult.getErrorMessage());
	else
		logDebug("Associated the modified LP to the CAP");
}

//John Schomp email workaround 2/24/13
//Aha!  I see what the problem is.   The getCapId function is being called on these event, even though it’s not needed since the master script gets its own cap ids from the event.
//I’ll log this with engineering.   If you want to get rid of the message, you can simply override the getCapId function by putting this one in the global include file:
//John Schomp email 2/25/13
//Hi, I logged case 13ACC-01449 and was told that this issue has been fixed in 7.2 FP2 Hotfix2.

function getCapId()  {

    var s_id1 = aa.env.getValue("PermitId1");
    var s_id2 = aa.env.getValue("PermitId2");
    var s_id3 = aa.env.getValue("PermitId3");

   if(s_id1==null || s_id1== "" 
           || s_id2==null || s_id2== "" 
                || s_id3==null || s_id3== "" )
     {
                return null;
           }
    var s_capResult = aa.cap.getCapID(s_id1, s_id2, s_id3);
    if(s_capResult.getSuccess())
      return s_capResult.getOutput();
    else
    {
     //  comment out this line to prevent message on v360inspectionresultsubmitafter
      //logMessage("**ERROR: Failed to get capId: " + s_capResult.getErrorMessage());
      return null;
    }
  }

function getOutput(result, object)
{
	if (result.getSuccess())
	{
		return result.getOutput();
	}
	else
	{
		logError("ERROR: Failed to get " + object + ": " + result.getErrorMessage());
		return null;
	}
}
/*------------------------------------------------------------------------------------------------------/
| Program : INCLUDES_CUSTOM.js
| Event   : N/A
|
| Usage   : Custom Script Include.  Insert custom EMSE Function below and they will be 
|	    available to all master scripts
|
| Notes   :
|
/------------------------------------------------------------------------------------------------------*/
/*------------------------------------------------------------------------------------------------------/
|  EDR Document Routing Functions (Start)
/------------------------------------------------------------------------------------------------------*/

function autoRouteReviews(reviewType,initial) 
{
	//reviewType is either E or P
	// E - Electronic
	// P - Physical
	//initial will be a Y/N, Y if the first time through the review process

	reviewListArray = new Array();
	reviewList = lookup(requiredReviewsStdChoice,appTypeString);
	reviewListArray = reviewList.split(",")

	//deleteNonRequiredWorkflowTasks(reviewListArray,"N");

	//set due dates on the tasks

	//schedulePlanReviewInspections(reviewListArray,initial);

	// If an electronic review create the document review tasks
	if (reviewType = "E" && initial == "Y") {
		docCategoryArray = new Array();
		docCategoryList = lookup(docCategoriesStdChoice,"ALL");
		docCategoryList = docCategoryList.toUpperCase();
		docCategoryArray = docCategoryList.split(",");

		processDocsForReview(docCategoryArray,reviewListArray,"Plan Review");
	}
}

function deleteNonRequiredWorkflowTasks(allTasksArray,dTask) {
	// Deactivates any review tasks that are not required by comparing the allTasksArray with 
	// the requiredTasksArray; This assumes all review tasks are parallel
	// If deleteTask = Y then the task will be deleted, otherwise it will be deactivated

	for (ata in allTasksArray) {
		var taskRequired = false;
		var thisTask = allTasksArray[ata];

		if(AInfo[thisTask] == "Yes") {
			taskRequired = true;
		}

		if (!taskRequired) {
			if (dTask == "Y") {
				deleteTask(capId,thisTask);
			} else {
				deactivateTask(thisTask);
			}
		}

		if (taskRequired) {
			editTaskDueDate(thisTask,AInfo[thisTask + " Date"]);
		}		
	} 
}

function schedulePlanReviewInspections(allTasksArray,initialReview) {
// initialReview will be a Y or N and will determine due dates

	for (rl in allTasksArray) {
		
		thisTask = allTasksArray[rl];

		if(AInfo[thisTask] == "Yes") {
			scheduleInspectDate(thisTask,AInfo[thisTask + " Date"]);
		}

		/*var dueDateDetails = lookup(dueDateStdChoice,thisTaskCode);

		if (dueDateDetails != undefined) {
			dueDateArray = dueDateDetails.split(",");

			var daysAhead = 0;

			if (initialReview) {
				daysAhead = parseInt(dueDateArray[1]);
			} else {
				daysAhead = parseInt(dueDateArray[2]);
			}

			if (dueDateArray[0] == "Y") {
				scheduleInspectDate(wfTaskNames[thisTaskCode],dateAdd(null,daysAhead,"Y"));
			} else {
				scheduleInspectDate(wfTaskNames[thisTaskCode],dateAdd(null,daysAhead));
			}
			
		}
		*/
	}
}

function getDocumentList() {
	// Returns an array of documentmodels if any
	// returns an empty array if no documents

	var docListArray = new Array();

	docListResult = aa.document.getCapDocumentList(capId,currentUserID);

	if (docListResult.getSuccess()) {		
		docListArray = docListResult.getOutput();
	}

	
	return docListArray;
}

function associateDoc2TaskAndReviewerDept(docs2Review,allTasksArray) 
{
	// creates the document review task for each required review, associate it to the
	// appropriate workflow task and assign to the user/dept on the workflow task
	logDebug(allTasksArray);

    var childId = null;
	taskName = null;
	
    if (arguments.length > 2)
        taskName = arguments[2]; // Task Name indicates there's a subprocess holding the review tasks

	if (taskName != null)
	{
		var workflowResult = aa.workflow.getTasks(capId);
		var wfObj = workflowResult.getOutput();
		for (i in wfObj) 
		{
			var fTaskSM = wfObj[i];
			if (fTaskSM.getTaskDescription().equals(taskName)) 
			{
				var relationArray = aa.workflow.getProcessRelationByCapID(capId, null).getOutput()
				for (thisRel in relationArray) 
				{
					y = relationArray[thisRel]
					if (y.getParentTaskName() && y.getParentTaskName().equals(fTaskSM.getTaskDescription()))
						childId = y.getProcessID();
				}
			}
		}
	}


	for (rta in allTasksArray) 
	{
		
		thisTask = allTasksArray[rta];
		
		thisTaskTSI = thisTask.substr(0,thisTask.lastIndexOf("iew"));
		logDebug("TSI: " + thisTaskTSI );

		logDebug("Checking " + AInfo[thisTaskTSI]);

		if(AInfo[thisTaskTSI] == "Yes") 		
                 {
			var reviewerList = aa.util.newArrayList();

			if (taskName == null)
				var taskItemResult = aa.workflow.getTask(capId,thisTask);
			else
				var taskItemResult = aa.workflow.getTaskItemByTaskDes(capId,thisTask,childId);			if(taskItemResult.getSuccess()) 
			{
				taskItem = taskItemResult.getOutput().getTaskItem();
				sysUserModel = taskItem.getAssignedUser();
				reviewerList.add(sysUserModel);
				var associateResult = aa.document.associateReviewer2Doc(docs2Review,reviewerList,taskItem);

				if(associateResult.getSuccess()) {
					logDebug("Added document review: " + thisTask);
					//If due dates need set
					//updateReviewTaskDueDate(dueDateStdChoice,requiredTasksArray[rta],true);
				} else {
					logDebug("Couldn't associate document review: " + thisTask);
				}

			} else {
				logDebug("Couldn't retrieve task: " + thisTask);
			}
		}

	}
}

function processDocsForReview(docCategories,allTasksArray,plnRvw) {
	//review each attached document and determine if it should be routed for review
	
	var docsList = new Array();

	docsList = getDocumentList();
	var assignDocList = aa.util.newArrayList();

	for (dl in docsList) {
		var thisDocument = docsList[dl];

		if (matches(thisDocument.getDocStatus(),"Uploaded","Revisions Received") && exists(thisDocument.getDocCategory().toUpperCase(),docCategories))
			assignDocList.add(thisDocument);

	}

	if (assignDocList.size() > 0) 
        {
                logDebug("Passing " + allTasksArray);
		associateDoc2TaskAndReviewerDept(assignDocList,allTasksArray,plnRvw);
		for (i = 0; i < assignDocList.size(); i++) 
                {
			var documentModel = assignDocList.get(i);
			documentModel.setDocStatus("Routed for Review");
			
			//aa.print("Source: " + documentModel.getSource());
			

                        documentModel.setSource(getVendor(documentModel.getSource(),documentModel.getSourceName()));
			documentModel.setRecStatus("A");	

		
                        updateDocResult = aa.document.updateDocument(documentModel);

			//aa.print("Source: " + documentModel.getSource());

			if (updateDocResult.getSuccess()) {
				logDebug(documentModel.getDocName() + " status updated to Routed for Review");
			} else {
				logDebug("Error updating " + documentModel.getDocName() + " to a status status of Routed for Review");
			}

		}

	} 
        else 
        {
		logDebug("No documents to review");
		return false;
	}
}

function getVendor(sourceValue, sourceName)
{
var _sourceVal = "STANDARD";
if(sourceValue != null && sourceValue != '')
{
           _sourceVal = sourceValue;
}
else if(sourceName != null && sourceName != '')
{
           var bizDomScriptResult = aa.bizDomain.getBizDomainByValue("EDMS",sourceName.toUpperCase());

         if (bizDomScriptResult.getSuccess())
                   {
                    bizDomScriptObj = bizDomScriptResult.getOutput();
                    var bizDescStr = bizDomScriptObj.getDescription();
                    var startPos = bizDescStr.indexOf("EDMS_VENDOR=");
                    var endPos = bizDescStr.indexOf(";",startPos);
                    if(startPos > -1 && endPos >-1)
                             {
                             _sourceVal = bizDescStr.substring(startPos+12,endPos).trim();
                             }
                    }
}
return _sourceVal;
}
/*------------------------------------------------------------------------------------------------------/
|  EDR Review Workflow Sync Functions (Start)
/------------------------------------------------------------------------------------------------------*/

function updatePlanReviewWorkflow(wfTask,status,wfComments,updateIndicator) {
	// updateIndicator determines if to update workflow or inspection
	// if a value of "W" workflow will be updated
	// if a value of "I" inspection will be updated
	// otherwise will return a false

	if (updateIndicator == "I") {
		var sysDateYYYYMMDD = dateFormatted(sysDate.getMonth(),sysDate.getDayOfMonth(),sysDate.getYear(),"YYYY-MM-DD");
		resultInspection(wfTask,status,sysDateYYYYMMDD,wfComments);
	} else if (updateIndicator == "W") {
		var action = "";

		action = lookup(docReviewStatusStdChoice,status);

		if (!matches(action,"",undefined)) {
			if (action == "Next") {
				closeTask(wfTask,status,wfComments,"");
				return true;
			} else if (action == "No Change") {
				updateTask(wfTask,status,wfComments,"");
				return true;
			} else if (action == "Loop") {
				loopTask(wfTask,status,wfComments,"");
				return true;
			} else if (action == "Branch") {
				branchTask(wfTask,status,wfComments,"");
				return true;
			} else {
				logDebug("Workflow not updated, action not defined");
				return false;
			}
		} else {
			logDebug("Workflow not updated, workflow task name not found");
			return false;
		}
	} else {
		logDebug("updateIndicator of " + updateIndicator + "is not a valid value only W or I are expected");
		return false;
	}
}

function checkAllReviewsTasksStatus(taskStatusName) {
	// returns true or false if a review task is found with a status of taskStatusName
	var reviewTasksArray = new Array();

	//Get the list of required review codes
	allTasksList = lookup(requiredReviewsStdChoice,"ALL COMM");
	reviewTasksArray = allTasksList.split(",");

	for (rta in reviewTasksArray) {
		
		thisTask = reviewTasksArray[rta];

		if(AInfo[thisTask] == "Yes") {
			var currentDisposition = "";
			// get the current disposition of the workflow
			currentDisposition = taskStatus(thisTask);
			if (currentDisposition == taskStatusName) {
				return true;
			} 
		}
	}
	// No tasks had the status of taskStatusName
	return false;
}

/*------------------------------------------------------------------------------------------------------/
|  EDR Review Workflow Sync Functions (End)
/------------------------------------------------------------------------------------------------------*/

/*------------------------------------------------------------------------------------------------------/
|  EDR Document Upload Functions (Start)
/------------------------------------------------------------------------------------------------------*/

function getDocOperation(docModelList)
{
	var docModel = docModelList.get(0);
	if(docModel == null)
	{
		return false;
	}
	
	if(docModel.getCategoryByAction() == null || "".equals(docModel.getCategoryByAction()))
	{
		return "UPLOAD";
	}
	//Judging it's check in
	else if("CHECK-IN".equals(docModel.getCategoryByAction()))
	{
		return "CHECK_IN";
	}
	//Judging it's resubmit or normal upload.
	else if("RESUBMIT".equals(docModel.getCategoryByAction()))
	{
		return "RESUBMIT";
	}
}

/*------------------------------------------------------------------------------------------------------/
|  EDR Document Upload Functions (End)
/------------------------------------------------------------------------------------------------------*/
/*------------------------------------------------------------------------------------------------------/
|  Notification Tempalte Functions (Start)
/------------------------------------------------------------------------------------------------------*/

function getRecordParams4Notification(params) {
	// pass in a hashtable and it will add the additional parameters to the table

	addParameter(params, "$$altID$$", capIDString);
	addParameter(params, "$$capName$$", capName);
	addParameter(params, "$$capStatus$$", capStatus);
	addParameter(params, "$$fileDate$$", fileDate);
	addParameter(params, "$$workDesc$$", workDescGet(capId));
	addParameter(params, "$$balanceDue$$", "$" + parseFloat(balanceDue).toFixed(2));
	
	return params;
}

function getACARecordParam4Notification(params,acaUrl) {
	// pass in a hashtable and it will add the additional parameters to the table

	addParameter(params, "$$acaRecordUrl$$", getACARecordURL(acaUrl));
	
	return params;	
}

function getACADocDownloadParam4Notification(params,acaUrl,docModel) {
	// pass in a hashtable and it will add the additional parameters to the table

	addParameter(params, "$$acaDocDownloadUrl$$", getACADocumentDownloadUrl(acaUrl,docModel));
	
	return params;	
}

function getContactParams4Notification(params,conType) {
	// pass in a hashtable and it will add the additional parameters to the table
	// pass in contact type to retrieve

	contactArray = getContactArray();

	for(ca in contactArray) {
		thisContact = contactArray[ca];

		if (thisContact["contactType"] == conType) {

			conType = conType.toLowerCase();

			addParameter(params, "$$" + conType + "LastName$$", thisContact["lastName"]);
			addParameter(params, "$$" + conType + "FirstName$$", thisContact["firstName"]);
			addParameter(params, "$$" + conType + "MiddleName$$", thisContact["middleName"]);
			addParameter(params, "$$" + conType + "BusinesName$$", thisContact["businessName"]);
			addParameter(params, "$$" + conType + "ContactSeqNumber$$", thisContact["contactSeqNumber"]);
			addParameter(params, "$$" + conType + "$$", thisContact["contactType"]);
			addParameter(params, "$$" + conType + "Relation$$", thisContact["relation"]);
			addParameter(params, "$$" + conType + "Phone1$$", thisContact["phone1"]);
			addParameter(params, "$$" + conType + "Phone2$$", thisContact["phone2"]);
			addParameter(params, "$$" + conType + "Email$$", thisContact["email"]);
			addParameter(params, "$$" + conType + "AddressLine1$$", thisContact["addressLine1"]);
			addParameter(params, "$$" + conType + "AddressLine2$$", thisContact["addressLine2"]);
			addParameter(params, "$$" + conType + "City$$", thisContact["city"]);
			addParameter(params, "$$" + conType + "State$$", thisContact["state"]);
			addParameter(params, "$$" + conType + "Zip$$", thisContact["zip"]);
			addParameter(params, "$$" + conType + "Fax$$", thisContact["fax"]);
			addParameter(params, "$$" + conType + "Notes$$", thisContact["notes"]);
			addParameter(params, "$$" + conType + "Country$$", thisContact["country"]);
			addParameter(params, "$$" + conType + "FullName$$", thisContact["fullName"]);
		}
	}

	return params;	
}

function getPrimaryAddressLineParam4Notification(params) {
	// pass in a hashtable and it will add the additional parameters to the table

    var addressLine = "";

	adResult = aa.address.getPrimaryAddressByCapID(capId,"Y");

	if (adResult.getSuccess()) {
		ad = adResult.getOutput().getAddressModel();

		addParameter(params, "$$addressLine$$", ad.getDisplayAddress());
	}

	return params;
}

function getPrimaryOwnerParams4Notification(params) {
	// pass in a hashtable and it will add the additional parameters to the table

	capOwnerResult = aa.owner.getOwnerByCapId(capId);

	if (capOwnerResult.getSuccess()) {
		owner = capOwnerResult.getOutput();

		for (o in owner) {
			thisOwner = owner[o];
			if (thisOwner.getPrimaryOwner() == "Y") {
				addParameter(params, "$$ownerFullName$$", thisOwner.getOwnerFullName());
				addParameter(params, "$$ownerPhone$$", thisOwner.getPhone);
				break;	
			}
		}
	}
	return params;
}


function getACADocumentDownloadUrl(acaUrl,documentModel) {
   	
   	//returns the ACA URL for supplied document model

	var acaUrlResult = aa.document.getACADocumentUrl(acaUrl, documentModel);
	if(acaUrlResult.getSuccess())
	{
		acaDocUrl = acaUrlResult.getOutput();
		return acaDocUrl;
	}
	else
	{
		logDebug("Error retrieving ACA Document URL: " + acaUrlResult.getErrorType());
		return false;
	}
}


function getACARecordURL(acaUrl) {
	
	var acaRecordUrl = "";
	var id1 = capId.ID1;
 	var id2 = capId.ID2;
 	var id3 = capId.ID3;

   	acaRecordUrl = acaUrl + "/urlrouting.ashx?type=1000";   
	acaRecordUrl += "&Module=" + cap.getCapModel().getModuleName();
	acaRecordUrl += "&capID1=" + id1 + "&capID2=" + id2 + "&capID3=" + id3;
	acaRecordUrl += "&agencyCode=" + aa.getServiceProviderCode();

   	return acaRecordUrl;
}



/*
 * add parameter to a hashtable, for use with notifications.
 */
function addParameter(pamaremeters, key, value)
{
	if(key != null)
	{
		if(value == null)
		{
			value = "";
		}
		pamaremeters.put(key, value);
	}
}

/*
 * Send notification
 */
function sendNotification(emailFrom,emailTo,emailCC,templateName,params,reportFile)
{
	var id1 = capId.ID1;
 	var id2 = capId.ID2;
 	var id3 = capId.ID3;

	var capIDScriptModel = aa.cap.createCapIDScriptModel(id1, id2, id3);


	var result = null;
	result = aa.document.sendEmailAndSaveAsDocument(emailFrom, emailTo, emailCC, templateName, params, capIDScriptModel, reportFile);
	if(result.getSuccess())
	{
		logDebug("Sent email successfully!");
		return true;
	}
	else
	{
		logDebug("Failed to send mail. - " + result.getErrorType());
		return false;
	}
}

/*------------------------------------------------------------------------------------------------------/
|  Notification Tempalte Functions (End)
/------------------------------------------------------------------------------------------------------*/




function getDeepLink4Record(itemCap,linkName, urlTemplate)
{
	var vTmpCapObj = aa.cap.getCap(itemCap);
	var vHyperLink = new String();
	if(vTmpCapObj.getSuccess())
	{
		var vTmpCap = vTmpCapObj.getOutput();	
		var vTmpCapTyp = vTmpCap.getCapType().toString();
		var vTmpCapTypArr = vTmpCapTyp.split("/");
		vHyperLink = "<a href='" + urlTemplate +"'>";
		vHyperLink = vHyperLink.replace("$$SERVPROVCODE$$",itemCap.getServiceProviderCode());
		vHyperLink = vHyperLink.replace("$$ID1$$",itemCap.getID1());
		vHyperLink = vHyperLink.replace("$$ID2$$",itemCap.getID2());
		vHyperLink = vHyperLink.replace("$$ID3$$",itemCap.getID3());
		vHyperLink = vHyperLink.replace("$$MODULE$$",vTmpCapTypArr[0]);
		if(linkName != null && linkName != "")
			vHyperLink = vHyperLink + linkName;
		else
			vHyperLink = vHyperLink + itemCap.getCustomID();
		vHyperLink = vHyperLink + "</a>";
	}
	return vHyperLink;
}

function getDeepLink4Document(itemCap, docId,linkName, urlTemplate)
{
	var vTmpCapObj = aa.cap.getCap(itemCap);
	var vHyperLink = new String();
	if(vTmpCapObj.getSuccess())
	{
		vHyperLink = "<a href='" + urlTemplate +"'>";
		vHyperLink = vHyperLink.replace("$$SERVPROVCODE$$",itemCap.getServiceProviderCode());
		vHyperLink = vHyperLink.replace("$$ID1$$",itemCap.getID1());
		vHyperLink = vHyperLink.replace("$$ID2$$",itemCap.getID2());
		vHyperLink = vHyperLink.replace("$$ID3$$",itemCap.getID3());
		vHyperLink = vHyperLink.replace("$$DOCSEQ$$",docId);
		if(linkName != null && linkName != "")
			vHyperLink = vHyperLink + linkName;
		else
			vHyperLink = vHyperLink + itemCap.getCustomID();
		vHyperLink = vHyperLink + "</a>";
	}
	return vHyperLink;
}

function emailContact(mSubj,mText)   // optional: Contact Type, default Applicant
	{
	var replyTo = "no-reply@grcity.us"; //updated to use grcity.us domain
	var contactType = "Applicant"
	var emailAddress = "";

	if (arguments.length == 3) contactType = arguments[2]; // use contact type specified

	var capContactResult = aa.people.getCapContactByCapID(capId);
	if (capContactResult.getSuccess())
		{
		var Contacts = capContactResult.getOutput();
		for (yy in Contacts)
			if (contactType.equals(Contacts[yy].getCapContactModel().getPeople().getContactType()))
				if (Contacts[yy].getEmail() != null)
					emailAddress = "" + Contacts[yy].getEmail();
		}

	if (emailAddress.indexOf("@") > 0)
		{
		aa.sendMail(replyTo, emailAddress, "", mSubj, mText);
		logDebug("Successfully sent email to " + contactType);
		}
	else
		logDebug("Couldn't send email to " + contactType + ", no valid email address");
	}


//Added by Keith 12-2-13 for CMN:SEND_ACCT_TRANS_EMAIL
function sendEmailwAttchmnt(fromAddress,toAddress,ccAddress,reportSubject,reportContent,aaReportName,parameters)
{
	var reportName = aaReportName;
	
	report = aa.reportManager.getReportInfoModelByName(reportName);
	report = report.getOutput(); 
	
	report.setModule(appTypeArray[0]); 
 
	report.setReportParameters(parameters);

        logDebug("Check for report permission."); 
        logDebug("Report Name = "+reportName);
        logDebug("User = "+currentUserID); 

	var permit = aa.reportManager.hasPermission(reportName,currentUserID); 
	if(permit.getOutput().booleanValue()) 
	{ 
		var reportResult = aa.reportManager.getReportResult(report); 
		
		if(reportResult) 
		{ 
			reportResult = reportResult.getOutput(); 
			var reportFile = aa.reportManager.storeReportToDisk(reportResult); 

			reportFile = reportFile.getOutput();
			var sendResult = aa.sendEmail(fromAddress,toAddress,ccAddress, reportSubject, reportContent, reportFile);
		}
		if(sendResult.getSuccess()) 
			logDebug("A copy of this report has been sent to the valid email addresses."); 
		else 
			logDebug("System failed send report to selected email addresses because mail server is broken or report file size is great than 5M."); 
	}
	else
		aa.print("No permission to report: "+ reportName + " for Admin" + systemUserObj);
}

// Added by lcanfield 9/17/14 per Accela Engineering to display condition banner for scripted conditions
function addAppCondition(cType,cStatus,cDesc,cComment,cImpact)
	{
	var addCapCondResult = aa.capCondition.addCapCondition(capId, cType, cDesc, cComment, sysDate, null, sysDate, null, null, cImpact, systemUserObj, systemUserObj, cStatus, currentUserID, "A", null, "Y", null, null, null, null, null, null, null, null, 0, null, null, null) 

        if (addCapCondResult.getSuccess())
        	{
		logDebug("Successfully added condition (" + cImpact + ") " + cDesc);
		logDebug("Successfully added condition (" + cImpact + ") " + cDesc);
		}
	else
		{
		logDebug( "**ERROR: adding condition (" + cImpact + "): " + addCapCondResult.getErrorMessage());
		}
	}

//Added by lcanfield 4/18/16 per Accela, Jason Plaisted to set document group and category for attachments upoaded through the inspector app
function updateDocGroupCategory(docNbr, docGroup, docCategory)
{	

	docModel = aa.document.getDocumentByPK(docNbr).getOutput();
	
	//update document category
	newDocGroup = docGroup; // "ENF";
	newDocCategory = docCategory; //"Map";
	docModel.setDocGroup(newDocGroup);
	docModel.setDocCategory(newDocCategory);
	
	updDocResult = aa.document.updateDocument(docModel);
	
	if(updDocResult.getSuccess())
	{
		updDocResult.getOutput();
		logDebug("Successfully updated document group and category: " + newDocGroup + " - " + newDocCategory);
		return true;
	}
	else
	{
		logDebug("Failed to update document. " + updDocResult.getErrorMessage());
		return false;
	}
}

// Added by lcanfield 5/24/2016 to enable blocking on GR-only app types on non-GR properties with ASB script
function loadParcelAttributesByParcel(thisArr) {
      // Modified version of the loadParcelAttributes()
      // Returns an associative array of Parcel Attributes
      // Optional second parameter, parcel number to load from
      // If no parcel is passed, function is using the ParcelValidatedNumber variable defined in the "BEGIN Event Specific Variables" list in ApplicationSubmitBefore

      var parcelNum = ParcelValidatedNumber;
      if (arguments.length == 2) parcelNum = arguments[1]; // use parcel number specified in args
     
        if (parcelNum.length != 0 && parcelNum != "" && parcelNum != null)
           {
         var fParcelObj = null;
         var parcelResult = aa.parcel.getParceListForAdmin(parcelNum, null, null, null, null, null, null, null, null, null);
         if (!parcelResult.getSuccess())
              logDebug("**ERROR: Failed to get Parcel object: " + parcelResult.getErrorType() + ":" + parcelResult.getErrorMessage());
         else
               var fParcelObj = parcelResult.getOutput()[0];
               var fParcelModel = fParcelObj.parcelModel;

               var parcelAttrObj = fParcelModel.getParcelAttribute().toArray();
               for (z in parcelAttrObj)
                   thisArr["ParcelAttribute." + parcelAttrObj[z].getAttributeName()]=parcelAttrObj[z].getAttributeValue();

              // Explicitly load some standard values
              thisArr["ParcelAttribute.Block"] = fParcelModel.getBlock();
              thisArr["ParcelAttribute.Book"] = fParcelModel.getBook();
              thisArr["ParcelAttribute.CensusTract"] = fParcelModel.getCensusTract();
              thisArr["ParcelAttribute.CouncilDistrict"] = fParcelModel.getCouncilDistrict();
              thisArr["ParcelAttribute.ExemptValue"] = fParcelModel.getExemptValue();
              thisArr["ParcelAttribute.ImprovedValue"] = fParcelModel.getImprovedValue();
              thisArr["ParcelAttribute.InspectionDistrict"] = fParcelModel.getInspectionDistrict();
              thisArr["ParcelAttribute.LandValue"] = fParcelModel.getLandValue();
              thisArr["ParcelAttribute.LegalDesc"] = fParcelModel.getLegalDesc();
              thisArr["ParcelAttribute.Lot"] = fParcelModel.getLot();
              thisArr["ParcelAttribute.MapNo"] = fParcelModel.getMapNo();
              thisArr["ParcelAttribute.MapRef"] = fParcelModel.getMapRef();
              thisArr["ParcelAttribute.ParcelArea"] = fParcelModel.getParcelArea();
              thisArr["ParcelAttribute.ParcelStatus"] = fParcelModel.getParcelStatus();
              thisArr["ParcelAttribute.SupervisorDistrict"] = fParcelModel.getSupervisorDistrict();
              thisArr["ParcelAttribute.Tract"] = fParcelModel.getTract();
              thisArr["ParcelAttribute.PlanArea"] = fParcelModel.getPlanArea();
           }
      }

//3-24-2017, function to format variables as currency. Pass balanceDue -ascott
function currencyFormat(num) {
	return "$" + num.toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
	}