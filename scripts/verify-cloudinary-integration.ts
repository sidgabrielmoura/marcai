import { 
  createUploadSignature, 
  createTenantUploadCredentials, 
  isAuthorizedCloudinaryUrl, 
  getOptimizedCloudinaryUrl 
} from '../src/infrastructure/cloudinary/cloudinary-service';

async function runTests() {
  console.log("=== INICIANDO TESTES DO CLOUDINARY ===");

  // Test 1: Signature generation
  const testParams = {
    folder: "tarefai/orgs/org_123/evidence",
    publicId: "test_upload_123"
  };
  const signedCreds = createUploadSignature(testParams);
  console.log("1. Assinatura gerada:", signedCreds.signature);
  if (!signedCreds.signature || signedCreds.signature.length !== 40) {
    throw new Error("Assinatura HMAC SHA-1 inválida ou com tamanho incorreto!");
  }
  console.log("   [OK] Assinatura SHA-1 válida (40 caracteres hexadecimais).");

  // Test 2: Tenant credentials creation
  const credentials = createTenantUploadCredentials({
    organizationId: "org_abc",
    scope: "evidence",
    userId: "usr_456",
    taskId: "tsk_789",
    mimeType: "image/jpeg"
  });
  console.log("2. Credenciais de Tenant geradas:");
  console.log("   CloudName:", credentials.cloudName);
  console.log("   Folder:", credentials.folder);
  console.log("   UploadUrl:", credentials.uploadUrl);
  console.log("   ResourceType:", credentials.resourceType);
  if (!credentials.folder.includes("org_abc") || !credentials.uploadUrl.includes("api.cloudinary.com")) {
    throw new Error("Estrutura de credenciais ou URL de upload incorreta!");
  }
  console.log("   [OK] Isolamento multi-tenant de pasta garantido.");

  // Test 3: Authorized Cloudinary URL validation
  const validUrl1 = `https://res.cloudinary.com/${credentials.cloudName}/image/upload/v12345/tarefai/orgs/org_abc/evidence/sample.jpg`;
  const validUrl2 = `https://res.cloudinary.com/${credentials.cloudName}/video/upload/v12345/sample.mp4`;
  const attackUrl1 = "https://res.cloudinary.com/attacker_cloud/image/upload/malicious.jpg";
  const attackUrl2 = "https://evil-phishing.com/image.jpg";
  const relativeUrl = "/images/default-avatar.png";

  console.log("3. Teste de Validação de Domínio & Nuvem Oficial:");
  if (!isAuthorizedCloudinaryUrl(validUrl1)) throw new Error("Deveria aceitar validUrl1!");
  if (!isAuthorizedCloudinaryUrl(validUrl2)) throw new Error("Deveria aceitar validUrl2!");
  if (isAuthorizedCloudinaryUrl(attackUrl1)) throw new Error("Deveria rejeitar cloud de terceiros!");
  if (isAuthorizedCloudinaryUrl(attackUrl2)) throw new Error("Deveria rejeitar domínio malicioso!");
  if (isAuthorizedCloudinaryUrl(relativeUrl)) throw new Error("Deveria rejeitar URL relativa não-Cloudinary!");
  console.log("   [OK] Validador rejeita terceiros e aceita exclusivamente a nuvem oficial.");

  // Test 4: Transformations and thumbnail optimization
  const thumbUrl = getOptimizedCloudinaryUrl(validUrl1, { width: 300, height: 300, crop: "fill" });
  console.log("4. URL com Transformação Dinâmica:", thumbUrl);
  if (!thumbUrl.includes("f_auto,q_auto") || !thumbUrl.includes("w_300,h_300,c_fill")) {
    throw new Error("Transformação dinâmica de otimização falhou!");
  }
  console.log("   [OK] Transformações otimizadas f_auto e q_auto injetadas com sucesso.");

  console.log("\n=== TODOS OS TESTES UNITÁRIOS DO CLOUDINARY FORAM CONCLUÍDOS COM SUCESSO! ===");
}

runTests().catch((err) => {
  console.error("FALHA NOS TESTES:", err);
  process.exit(1);
});
