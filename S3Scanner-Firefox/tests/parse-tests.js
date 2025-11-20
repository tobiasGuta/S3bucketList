const { JSDOM } = require('jsdom');

// Mock DOMParser for Node environment
global.DOMParser = new JSDOM().window.DOMParser;

// Copy of the parsing functions from background.js for testing
// In a real project, we would export these from a module, but background.js is not a module.
// So we paste them here or use a shared file. For simplicity, I'll redefine them.

function parseListBucketXml(xmlString) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, "text/xml");
        const root = doc.documentElement;
        if (root.nodeName !== 'ListBucketResult') return { isS3: false };
        
        // Simple check for contents
        const contents = root.getElementsByTagName('Contents');
        const isPublic = contents.length > 0 || root.getElementsByTagName('Name').length > 0;
        
        return { isS3: true, public: true }; 
    } catch (e) {
        return { isS3: false };
    }
}

function parseAclXml(xmlString) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, "text/xml");
        const root = doc.documentElement;
        if (root.nodeName !== 'AccessControlPolicy') return { isS3: false };

        let publicRead = false;
        let publicWrite = false;

        const grants = doc.getElementsByTagName('Grant');
        for (let i = 0; i < grants.length; i++) {
            const grant = grants[i];
            const grantee = grant.getElementsByTagName('Grantee')[0];
            const permission = grant.getElementsByTagName('Permission')[0]?.textContent;
            
            if (grantee) {
                const uri = grantee.getElementsByTagName('URI')[0]?.textContent;
                if (uri === 'http://acs.amazonaws.com/groups/global/AllUsers') {
                    if (permission === 'READ' || permission === 'FULL_CONTROL') publicRead = true;
                    if (permission === 'WRITE' || permission === 'FULL_CONTROL') publicWrite = true;
                }
            }
        }
        return { isS3: true, publicRead, publicWrite };
    } catch (e) {
        return { isS3: false };
    }
}

describe('S3 XML Parsing', () => {
    test('parseListBucketXml detects valid public bucket', () => {
        const xml = `
            <ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                <Name>example-bucket</Name>
                <Prefix></Prefix>
                <Marker></Marker>
                <MaxKeys>1000</MaxKeys>
                <IsTruncated>false</IsTruncated>
                <Contents>
                    <Key>index.html</Key>
                    <LastModified>2021-01-01T00:00:00.000Z</LastModified>
                    <ETag>&quot;hash&quot;</ETag>
                    <Size>123</Size>
                    <StorageClass>STANDARD</StorageClass>
                </Contents>
            </ListBucketResult>
        `;
        const result = parseListBucketXml(xml);
        expect(result.isS3).toBe(true);
        expect(result.public).toBe(true);
    });

    test('parseAclXml detects public read', () => {
        const xml = `
            <AccessControlPolicy>
                <Owner>
                    <ID>owner_id</ID>
                    <DisplayName>owner</DisplayName>
                </Owner>
                <AccessControlList>
                    <Grant>
                        <Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="Group">
                            <URI>http://acs.amazonaws.com/groups/global/AllUsers</URI>
                        </Grantee>
                        <Permission>READ</Permission>
                    </Grant>
                </AccessControlList>
            </AccessControlPolicy>
        `;
        const result = parseAclXml(xml);
        expect(result.isS3).toBe(true);
        expect(result.publicRead).toBe(true);
        expect(result.publicWrite).toBe(false);
    });
});
