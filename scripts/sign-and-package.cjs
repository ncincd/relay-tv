const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Dom = require('/Users/macbookpro/.vscode/extensions/tizensdk.tizentv-1.3.3/node_modules/xmldom').DOMParser;
const { ExclusiveCanonicalization } = require('/Users/macbookpro/.vscode/extensions/tizensdk.tizentv-1.3.3/node_modules/@tizentv/webide-common-tizentv/lib/exclusive-canonicalization');
const cryptUtil = require('/Users/macbookpro/.vscode/extensions/tizensdk.tizentv-1.3.3/node_modules/@tizentv/webide-common-tizentv/lib/cryptUtil.js');
const archiver = require('/Users/macbookpro/.vscode/extensions/tizensdk.tizentv-1.3.3/node_modules/archiver');

const authorPropDgst = 'lpo8tUDs054eLlBQXiDPVDVKfw30ZZdtkRs1jd7H5K8=';
const distributorPropDgst = 'u/jU3U4Zm5ihTMSjKGlGYbWzDfRkGphPPHx3gJIYEJ4=';

class Reference {
  constructor(uri) {
    this.uri = uri;
    this.digestValue = '';
  }

  digest(content) {
    if (this.uri === '#prop') {
      this.digestValue = content;
    } else {
      const shasum = crypto.createHash('sha256');
      shasum.update(content);
      this.digestValue = shasum.digest('base64');
    }
  }

  getElement() {
    const transform =
      `<Transforms>\n` +
      `<Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"></Transform>\n` +
      `</Transforms>\n`;

    return (
      `<Reference URI="${this.uri}">\n` +
      `${this.uri === '#prop' ? transform : ''}` +
      `<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>\n` +
      `<DigestValue>${this.digestValue}</DigestValue>\n` +
      `</Reference>\n`
    );
  }
}

class Signature {
  constructor(id, projectRoot) {
    this.id = id;
    this.projectRoot = projectRoot;
    this.signedInfo = '';
    this.signatureValue = '';
    this.keyInfo = '';
  }

  _listFiles() {
    const dirList = [];
    const excludeFile =
      this.id === 'AuthorSignature'
        ? ['author-signature.xml', 'signature1.xml', 'signature2.xml']
        : ['signature1.xml', 'signature2.xml'];

    function _listDirs(curDir) {
      const entries = fs.readdirSync(curDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.resolve(curDir, entry.name);
        if (entry.isDirectory()) {
          _listDirs(fullPath);
        } else {
          if (!excludeFile.includes(entry.name)) {
            dirList.push(fullPath);
          }
        }
      }
    }

    _listDirs(this.projectRoot);
    return dirList.sort();
  }

  _addReferences(fileList) {
    let references = '';
    fileList.forEach((file) => {
      // Relative path preserving forward slashes for zip entries
      const relPath = path.relative(this.projectRoot, file).split(path.sep).map(encodeURIComponent).join('/');
      const ref = new Reference(relPath);
      ref.digest(fs.readFileSync(file));
      references += ref.getElement();
    });

    const propRef = new Reference('#prop');
    propRef.digest(this.id === 'AuthorSignature' ? authorPropDgst : distributorPropDgst);
    references += propRef.getElement();

    return references;
  }

  sign(key) {
    const fileList = this._listFiles();
    const references = this._addReferences(fileList);

    this.signedInfo =
      '<SignedInfo>\n' +
      '<CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod>\n' +
      '<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>\n' +
      `${references}` +
      '</SignedInfo>\n';

    const signWrapper = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${this.signedInfo}</Signature>`;
    const xml = new Dom().parseFromString(signWrapper);
    const node = xml.documentElement.firstChild;
    const transform = new ExclusiveCanonicalization();
    const canonedXML = transform.process(node, {
      defaultNsForPrefix: { ds: 'http://www.w3c.org/2000/09/xmldsig#' }
    });

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(canonedXML);
    const sigValue = signer.sign(key, 'base64');
    this.signatureValue = `<SignatureValue>${sigValue}</SignatureValue>`;
  }

  addKeyInfo(certChain) {
    this.keyInfo = '<KeyInfo><X509Data>\n';
    certChain.forEach((cert) => {
      cert = cert.replace(/\r\n/g, '\n').trim();
      this.keyInfo += `<X509Certificate>\n${cert}\n</X509Certificate>\n`;
    });
    this.keyInfo += '</X509Data>\n</KeyInfo>\n';
  }

  generateSignatureXml() {
    return (
      `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#" Id="${this.id}">\n` +
      `${this.signedInfo}` +
      `${this.signatureValue}\n` +
      `${this.keyInfo}` +
      `<Object Id="prop"><SignatureProperties xmlns:dsp="http://www.w3.org/2009/xmldsig-properties"><SignatureProperty Id="profile" Target="#${this.id}"><dsp:Profile URI="http://www.w3.org/ns/widgets-digsig#profile"></dsp:Profile></SignatureProperty><SignatureProperty Id="role" Target="#${this.id}"><dsp:Role URI="http://www.w3.org/ns/widgets-digsig#role-${this.id === 'AuthorSignature' ? 'author' : 'distributor'}"></dsp:Role></SignatureProperty><SignatureProperty Id="identifier" Target="#${this.id}"><dsp:Identifier></dsp:Identifier></SignatureProperty></SignatureProperties></Object>\n` +
      `</Signature>\n`
    );
  }
}

async function buildAndSign() {
  const distDir = path.resolve(__dirname, '..', 'dist');
  const outputWgt = path.resolve(__dirname, '..', 'RelayTV.wgt');

  // Clean old signatures if present
  ['author-signature.xml', 'signature1.xml', 'signature2.xml'].forEach((f) => {
    const p = path.join(distDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  console.log('1. Parsing certificates...');
  const authorKeyPath = '/Users/macbookpro/tizen-studio-data/vscode-tizentv/resource/Author/Author/relaytv_author.p12';
  const authorInfo = cryptUtil.parseP12File(authorKeyPath, 'relaytvpassword123');

  // Use the NEW distributor certificate valid until 2032!
  const distKeyPath = '/Users/macbookpro/tizentv-tools/certificate-generator/certificates/distributor/sdk-public/tizen-distributor-signer.p12';
  const distInfo = cryptUtil.parseP12File(distKeyPath, 'tizenpkcs12passfordsigner');

  console.log('2. Signing AuthorSignature...');
  const authorSig = new Signature('AuthorSignature', distDir);
  authorSig.sign(authorInfo.privateKey);
  authorSig.addKeyInfo(authorInfo.certChain);
  fs.writeFileSync(path.join(distDir, 'author-signature.xml'), authorSig.generateSignatureXml(), 'utf-8');

  console.log('3. Signing DistributorSignature (signature1.xml)...');
  const distSig = new Signature('DistributorSignature', distDir);
  distSig.sign(distInfo.privateKey);
  distSig.addKeyInfo(distInfo.certChain);
  fs.writeFileSync(path.join(distDir, 'signature1.xml'), distSig.generateSignatureXml(), 'utf-8');

  console.log('4. Creating signed .wgt package at:', outputWgt);
  if (fs.existsSync(outputWgt)) fs.unlinkSync(outputWgt);

  const output = fs.createWriteStream(outputWgt);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      console.log(`Package built successfully! (${archive.pointer()} total bytes)`);
      resolve(outputWgt);
    });

    archive.on('error', reject);
    archive.pipe(output);

    function addDirToZip(curDir) {
      const items = fs.readdirSync(curDir, { withFileTypes: true });
      for (const item of items) {
        if (item.name.startsWith('.')) continue;
        const fullPath = path.join(curDir, item.name);
        const relPath = path.relative(distDir, fullPath);
        if (item.isDirectory()) {
          addDirToZip(fullPath);
        } else {
          archive.file(fullPath, { name: relPath });
        }
      }
    }

    addDirToZip(distDir);
    archive.finalize();
  });
}

buildAndSign()
  .then((wgt) => console.log('PACKAGE SIGNED & READY:', wgt))
  .catch((err) => {
    console.error('Error signing package:', err);
    process.exit(1);
  });
