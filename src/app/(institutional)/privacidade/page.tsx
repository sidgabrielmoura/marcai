import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description:
    "Saiba como o Tarefaí coleta, utiliza, armazena e protege os seus dados pessoais em conformidade com a LGPD.",
};

export default function PrivacyPolicyPage() {
  return (
    <article className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl p-6 sm:p-10 shadow-xs">
      {/* Cabeçalho do documento */}
      <header className="border-b border-[var(--border-subtle)] pb-8 mb-8">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--brand-700)] uppercase tracking-wider mb-2">
          <ShieldCheck className="size-4" />
          <span>Privacidade & Proteção de Dados</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          Política de Privacidade
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
          <span>Última atualização: 24 de outubro de 2026</span>
          <span className="hidden sm:inline">•</span>
          <span>Versão 1.1</span>
          <span className="hidden sm:inline">•</span>
          <span>Em conformidade com a LGPD (Lei Federal nº 13.709/2018)</span>
        </div>

        <p className="mt-4 text-sm sm:text-[15px] text-[var(--text-secondary)] leading-relaxed">
          Esta Política de Privacidade descreve com transparência como a plataforma Tarefaí
          coleta, utiliza, processa, armazena e resguarda os dados pessoais de colaboradores,
          gestores e administradores que utilizam nossos serviços para gestão e execução
          de tarefas operacionais.
        </p>

        {/* Alternador rápido para termos e política de segurança */}
        <div className="mt-5 p-3.5 bg-[var(--canvas)] rounded-xl border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <span className="text-[var(--text-secondary)]">
            Consulte também as regras contratuais e nossa arquitetura técnica de proteção:
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/termos"
              className="inline-flex items-center gap-1 font-semibold text-[var(--brand-700)] hover:text-[var(--brand-900)]"
            >
              <span>Termos de Uso</span>
              <ArrowRight className="size-3" />
            </Link>
            <span className="text-[var(--neutral-300)]">•</span>
            <Link
              href="/seguranca"
              className="inline-flex items-center gap-1 font-semibold text-[var(--brand-700)] hover:text-[var(--brand-900)]"
            >
              <span>Segurança</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </header>

      {/* Sumário */}
      <section className="mb-10 p-5 bg-[var(--canvas)] rounded-xl border border-[var(--border-subtle)]">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-3">
          Índice do documento
        </h2>
        <nav>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-[var(--text-secondary)] list-decimal list-inside">
            <li><a href="#introducao" className="hover:text-[var(--brand-900)]">Introdução e Definições</a></li>
            <li><a href="#papeis-lgpd" className="hover:text-[var(--brand-900)]">Papéis sob a LGPD</a></li>
            <li><a href="#dados-coletados" className="hover:text-[var(--brand-900)]">Dados Pessoais Coletados</a></li>
            <li><a href="#biometria-webauthn" className="hover:text-[var(--brand-900)]">Autenticação e Biometria</a></li>
            <li><a href="#finalidades" className="hover:text-[var(--brand-900)]">Finalidades do Tratamento</a></li>
            <li><a href="#compartilhamento" className="hover:text-[var(--brand-900)]">Compartilhamento de Dados</a></li>
            <li><a href="#armazenamento" className="hover:text-[var(--brand-900)]">Armazenamento e Retenção</a></li>
            <li><a href="#direitos-titular" className="hover:text-[var(--brand-900)]">Seus Direitos como Titular</a></li>
            <li><a href="#cookies-sessoes" className="hover:text-[var(--brand-900)]">Cookies e Sessões</a></li>
            <li><a href="#contato-dpo" className="hover:text-[var(--brand-900)]">Contato e Encarregado (DPO)</a></li>
          </ol>
        </nav>
      </section>

      {/* Conteúdo textual */}
      <div className="space-y-8 text-sm sm:text-[15px] leading-relaxed text-[var(--text-secondary)]">
        {/* Seção 1 */}
        <section id="introducao" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            1. Introdução e Definições
          </h2>
          <p>
            O Tarefaí é um sistema corporativo de gestão e execução operacional, desenvolvido
            para viabilizar o acompanhamento, checklist, padronização e execução de rotinas,
            processos e tarefas em equipes organizacionais.
          </p>
          <p>
            Para os fins desta Política, consideram-se:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-[var(--text-primary)]">Plataforma:</strong> o software, site e aplicações móveis sob o domínio tarefai.com.br.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Organização Contratante (Cliente):</strong> a pessoa jurídica ou estabelecimento que contrata o Tarefaí para gerenciar sua operação e colaboradores.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Usuário / Colaborador:</strong> a pessoa física que acessa o Tarefaí (seja por PIN, senha ou biometria) para executar tarefas, gerenciar equipes ou supervisionar unidades.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">LGPD:</strong> a Lei Geral de Proteção de Dados Pessoais do Brasil (Lei nº 13.709/2018).
            </li>
          </ul>
        </section>

        {/* Seção 2 */}
        <section id="papeis-lgpd" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            2. Papéis sob a Lei Geral de Proteção de Dados (LGPD)
          </h2>
          <p>
            Na prestação dos seus serviços de software como serviço (SaaS):
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              A <strong className="text-[var(--text-primary)]">Organização Contratante</strong> atua como <strong className="text-[var(--text-primary)]">Controladora</strong> dos dados pessoais de seus colaboradores e operadores, decidindo quais usuários cadastrar, quais rotinas atribuir e quais evidências exigir.
            </li>
            <li>
              O <strong className="text-[var(--text-primary)]">Tarefaí</strong> atua predominantemente como <strong className="text-[var(--text-primary)]">Operador</strong>, processando tais informações exclusivamente sob instrução e em benefício da Organização Contratante, com estrito compromisso de confidencialidade e segurança.
            </li>
          </ul>
        </section>

        {/* Seção 3 */}
        <section id="dados-coletados" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            3. Dados Pessoais Coletados
          </h2>
          <p>
            Coletamos apenas os dados estritamente necessários para viabilizar o funcionamento
            adequado do sistema e o registro fidedigno das atividades operacionais:
          </p>
          <div className="space-y-2">
            <p>
              <strong className="text-[var(--text-primary)]">a) Dados de Identificação Cadastral:</strong> Nome, endereço de e-mail corporativo (quando aplicável), número de matrícula ou código de identificação do colaborador, cargo, unidade ou departamento de lotação.
            </p>
            <p>
              <strong className="text-[var(--text-primary)]">b) Credenciais de Acesso:</strong> Código de acesso individual (PIN numérico) e/ou senha criptografada. Tais senhas são armazenadas utilizando funções de derivação criptográfica irreversíveis (hashing forte).
            </p>
            <p>
              <strong className="text-[var(--text-primary)]">c) Registros de Execução Operacional:</strong> Horários de início e conclusão de tarefas, respostas a itens de checklist, observações registradas durante a execução, fotos de comprovação ou evidências enviadas pelo usuário e assinaturas digitais quando requeridas pelo processo.
            </p>
            <p>
              <strong className="text-[var(--text-primary)]">d) Metadados Técnicos de Acesso:</strong> Endereço IP de origem, data e hora da requisição, tipo de navegador e identificadores de sessão com a finalidade exclusiva de auditoria, prevenção a fraudes e garantia da segurança da plataforma.
            </p>
          </div>
        </section>

        {/* Seção 4 */}
        <section id="biometria-webauthn" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            4. Autenticação Rápida e Dados Biométricos (WebAuthn / FIDO2)
          </h2>
          <p>
            O Tarefaí oferece a opção de autenticação biométrica (como leitura de impressão digital
            ou reconhecimento facial, tais como Touch ID, Face ID ou Windows Hello) para simplificar
            o acesso de colaboradores no dia a dia.
          </p>
          <div className="p-4 bg-[var(--canvas)] rounded-xl border border-[var(--border-subtle)] text-xs sm:text-sm">
            <strong className="text-[var(--text-primary)] block mb-1">
              Importante: O Tarefaí NUNCA recebe nem armazena suas impressões digitais ou feições faciais.
            </strong>
            <p>
              A autenticação biométrica utiliza o padrão aberto de segurança W3C WebAuthn / FIDO2.
              A validação biométrica ocorre de forma 100% local, no próprio chip de segurança do seu
              aparelho (como o Secure Enclave ou TPM). Apenas uma assinatura criptográfica de sucesso
              é transmitida aos nossos servidores, garantindo que nenhum dado biométrico bruto jamais
              saia do seu dispositivo pessoal ou corporativo.
            </p>
          </div>
        </section>

        {/* Seção 5 */}
        <section id="finalidades" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            5. Finalidades do Tratamento de Dados
          </h2>
          <p>
            Os dados pessoais tratados pelo Tarefaí destinam-se exclusivamente às seguintes finalidades legítimas:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              Permitir a criação, atribuição, acompanhamento e homologação de tarefas operacionais;
            </li>
            <li>
              Garantir a autenticação confiável de colaboradores e gestores para prevenção de acessos não autorizados;
            </li>
            <li>
              Fornecer relatórios de desempenho e conformidade de rotinas internas para a Organização Contratante;
            </li>
            <li>
              Manter trilhas de auditoria necessárias à segurança jurídica e operacional da organização;
            </li>
            <li>
              Cumprir determinações legais, regulatórias ou ordens de autoridades competentes.
            </li>
          </ul>
        </section>

        {/* Seção 6 */}
        <section id="compartilhamento" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            6. Compartilhamento de Dados
          </h2>
          <p>
            Não comercializamos, alugamos nem transferimos dados pessoais de nossos usuários
            para terceiros para fins de marketing ou publicidade. O compartilhamento ocorre
            exclusivamente nos seguintes contextos:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-[var(--text-primary)]">Com a Organização Contratante:</strong> Gestores e administradores designados pela sua empresa têm acesso às tarefas atribuídas, executadas e registradas pelos respectivos colaboradores.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Com Fornecedores de Infraestrutura Crítica:</strong> Provedores de hospedagem em nuvem, bancos de dados e serviços de entrega técnica (ex: servidores e canais de notificação push), todos obrigados contratualmente aos mesmos padrões de segurança e confidencialidade.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Por Obrigação Legal ou Judicial:</strong> Mediante requisição fundamentada de autoridade administrativa ou ordem judicial aplicável.
            </li>
          </ul>
        </section>

        {/* Seção 7 */}
        <section id="armazenamento" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            7. Armazenamento, Retenção e Descarte
          </h2>
          <p>
            Os dados são armazenados em servidores de nuvem de alta segurança e disponibilidade,
            com proteção lógica e criptográfica.
          </p>
          <p>
            O período de guarda dos registros de execução e logs obedece aos prazos definidos no
            contrato de prestação de serviços com a Organização Contratante, bem como aos prazos
            prescricionais previstos na legislação brasileira (como o Marco Civil da Internet e a
            legislação trabalhista e civil). Quando os dados deixam de ser necessários, são excluídos
            de forma segura ou anonimizados.
          </p>
        </section>

        {/* Seção 8 */}
        <section id="direitos-titular" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            8. Seus Direitos como Titular de Dados
          </h2>
          <p>
            Nos termos do Artigo 18 da LGPD, o titular de dados pessoais possui o direito de obter:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Confirmação da existência de tratamento de seus dados pessoais;</li>
            <li>Acesso aos dados coletados;</li>
            <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
            <li>Informações sobre as entidades públicas e privadas com as quais houve compartilhamento;</li>
            <li>Revogação do consentimento, quando esta for a base legal aplicável.</li>
          </ul>
          <p>
            Como o Tarefaí atua predominantemente como Operador em relação aos dados inseridos pela
            sua empresa empregadora, solicitações de alteração cadastral ou exclusão de histórico
            de tarefas podem requerer validação e processamento em conjunto com a sua organização.
          </p>
        </section>

        {/* Seção 9 */}
        <section id="cookies-sessoes" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            9. Cookies e Tecnologias de Sessão
          </h2>
          <p>
            O Tarefaí utiliza apenas cookies estritamente necessários e armazenamento local técnico
            (como <code>localStorage</code> e <code>IndexedDB</code>) para:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Manter sua sessão de trabalho autenticada de forma segura;</li>
            <li>Preservar preferências de exibição de tela e tema visual;</li>
            <li>
              Permitir a persistência de rascunhos de tarefas em andamento em caso de oscilação momentânea de conexão à internet.
            </li>
          </ul>
          <p>
            Não utilizamos cookies de rastreamento invasivo entre diferentes sites nem pixels de publicidade.
          </p>
        </section>

        {/* Seção 10 */}
        <section id="contato-dpo" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            10. Contato e Encarregado de Proteção de Dados (DPO)
          </h2>
          <p>
            Em caso de dúvidas sobre esta Política, sobre o tratamento de seus dados ou para exercer
            qualquer dos seus direitos de titular previstos em lei, entre em contato com o nosso
            Encarregado pelo Tratamento de Dados Pessoais (DPO):
          </p>
          <div className="p-4 bg-[var(--canvas)] rounded-xl border border-[var(--border-subtle)] text-xs sm:text-sm space-y-1">
            <p><strong className="text-[var(--text-primary)]">Canal de Privacidade:</strong> privacidade@tarefai.com.br</p>
            <p><strong className="text-[var(--text-primary)]">Endereço eletrônico geral:</strong> suporte@tarefai.com.br</p>
            <p><strong className="text-[var(--text-primary)]">Prazo de resposta:</strong> respondemos a solicitações de titulares nos prazos estabelecidos pela legislação aplicável.</p>
          </div>
        </section>
      </div>
    </article>
  );
}
