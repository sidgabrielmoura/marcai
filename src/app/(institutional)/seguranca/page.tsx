import type { Metadata } from "next";
import Link from "next/link";
import { Lock, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Políticas de Segurança",
  description:
    "Conheça as medidas técnicas, arquiteturais e organizacionais adotadas pelo Tarefaí para garantir a segurança, integridade e confidencialidade da sua operação.",
};

export default function SecurityPolicyPage() {
  return (
    <article className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl p-6 sm:p-10 shadow-xs">
      {/* Cabeçalho do documento */}
      <header className="border-b border-[var(--border-subtle)] pb-8 mb-8">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--brand-700)] uppercase tracking-wider mb-2">
          <Lock className="size-4" />
          <span>Segurança da Informação & Integridade</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          Políticas de Segurança da Informação
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
          <span>Última atualização: 24 de outubro de 2026</span>
          <span className="hidden sm:inline">•</span>
          <span>Versão 1.1</span>
          <span className="hidden sm:inline">•</span>
          <span>Diretrizes de Proteção, Disponibilidade e Confiabilidade</span>
        </div>

        <p className="mt-4 text-sm sm:text-[15px] text-[var(--text-secondary)] leading-relaxed">
          A segurança da informação e a disponibilidade operacional são pilares centrais do Tarefaí.
          Este documento estabelece as diretrizes arquiteturais, os controles técnicos e os procedimentos
          organizacionais empregados para proteger os dados da sua empresa, garantir a integridade dos
          registros e mitigar riscos cibernéticos.
        </p>

        {/* Alternador rápido para termos e privacidade */}
        <div className="mt-5 p-3.5 bg-[var(--canvas)] rounded-xl border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <span className="text-[var(--text-secondary)]">
            Consulte também as condições de contratação e as diretrizes de dados pessoais:
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
              href="/privacidade"
              className="inline-flex items-center gap-1 font-semibold text-[var(--brand-700)] hover:text-[var(--brand-900)]"
            >
              <span>Privacidade</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </header>

      {/* Sumário */}
      <section className="mb-10 p-5 bg-[var(--canvas)] rounded-xl border border-[var(--border-subtle)]">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-3">
          Índice das Diretrizes de Segurança
        </h2>
        <nav>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-[var(--text-secondary)] list-decimal list-inside">
            <li><a href="#principios" className="hover:text-[var(--brand-900)]">Princípios e Governança</a></li>
            <li><a href="#multi-tenancy" className="hover:text-[var(--brand-900)]">Isolamento Multi-Tenant de Dados</a></li>
            <li><a href="#autenticacao" className="hover:text-[var(--brand-900)]">Autenticação e Controle de Acessos</a></li>
            <li><a href="#criptografia" className="hover:text-[var(--brand-900)]">Criptografia em Trânsito e Repouso</a></li>
            <li><a href="#trilhas-auditoria" className="hover:text-[var(--brand-900)]">Trilhas de Auditoria e Logs</a></li>
            <li><a href="#resiliencia-backups" className="hover:text-[var(--brand-900)]">Resiliência e Backups</a></li>
            <li><a href="#protecao-rede" className="hover:text-[var(--brand-900)]">Proteção de Infraestrutura e Redes</a></li>
            <li><a href="#gestao-vulnerabilidades" className="hover:text-[var(--brand-900)]">Gestão de Vulnerabilidades</a></li>
            <li><a href="#boas-praticas-usuario" className="hover:text-[var(--brand-900)]">Responsabilidades do Usuário</a></li>
            <li><a href="#reporte-seguranca" className="hover:text-[var(--brand-900)]">Canal de Reporte e Segurança</a></li>
          </ol>
        </nav>
      </section>

      {/* Conteúdo textual */}
      <div className="space-y-8 text-sm sm:text-[15px] leading-relaxed text-[var(--text-secondary)]">
        {/* Seção 1 */}
        <section id="principios" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            1. Princípios e Governança de Segurança
          </h2>
          <p>
            O Tarefaí projeta suas soluções sob o conceito de <em>Security by Design</em> (Segurança desde a Concepção)
            e <em>Security by Default</em> (Segurança por Padrão). Toda funcionalidade, rota de API e armazenamento
            é concebido visando:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-[var(--text-primary)]">Confidencialidade:</strong> Garantir que os dados da sua empresa só possam ser acessados por usuários expressamente autorizados.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Integridade:</strong> Assegurar que os registros de execução de processos, evidências e checklists não possam ser adulterados indevidamente.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Disponibilidade:</strong> Manter a infraestrutura operacional estável, resiliente e acessível durante a rotina de trabalho das equipes.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Rastreabilidade (Não-repúdio):</strong> Registrar eventos críticos de forma auditável e transparente para fins de conformidade.
            </li>
          </ul>
        </section>

        {/* Seção 2 */}
        <section id="multi-tenancy" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            2. Isolamento de Dados e Arquitetura Multi-Tenant
          </h2>
          <p>
            A plataforma opera em ambiente com estrito isolamento lógico entre organizações (multi-tenancy):
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              Cada requisição a recursos operacionais (tarefas, processos, colaboradores, templates, histórico) valida compulsoriamente a identificação e o vínculo da organização do usuário solicitante.
            </li>
            <li>
              É estritamente vedada a consulta direta a recursos de banco de dados sem a filtragem pelo identificador do tenant correspondente, prevenindo vulnerabilidades de Broken Object Level Authorization (BOLA/IDOR).
            </li>
            <li>
              Controles de escopo garantem que colaboradores de uma unidade ou organização não tenham qualquer visibilidade sobre dados, tarefas ou equipes de terceiros.
            </li>
          </ul>
        </section>

        {/* Seção 3 */}
        <section id="autenticacao" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            3. Autenticação e Controle de Acessos
          </h2>
          <p>
            O Tarefaí implementa múltiplos fatores e métodos seguros de autenticação projetados para o ambiente operacional:
          </p>
          <div className="space-y-2">
            <p>
              <strong className="text-[var(--text-primary)]">a) Autenticação por PIN:</strong> Utilizado para simplificar o login de operadores no chão de fábrica, lojas ou unidades de atendimento. Os PINs são associados à organização e à matrícula do colaborador, possuindo limites contra tentativas consecutivas de força bruta (rate limiting).
            </p>
            <p>
              <strong className="text-[var(--text-primary)]">b) Autenticação por Senha:</strong> Destinada a gestores e administradores, exige requisitos de complexidade mínima e conta com hashing irreversível via algoritmos modernos com sal individual (bcrypt).
            </p>
            <p>
              <strong className="text-[var(--text-primary)]">c) Autenticação Biométrica via WebAuthn:</strong> Compatível com biometria nativa dos dispositivos (Touch ID, Face ID, Windows Hello). Nenhum segredo biométrico trafega na rede ou fica armazenado em nossos servidores; a verificação ocorre no enclave seguro do hardware do usuário.
            </p>
            <p>
              <strong className="text-[var(--text-primary)]">d) Gestão de Sessões:</strong> Sessões de acesso são autenticadas por meio de tokens criptografados com tempo de expiração determinado e validação de revogação.
            </p>
          </div>
        </section>

        {/* Seção 4 */}
        <section id="criptografia" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            4. Criptografia em Trânsito e em Repouso
          </h2>
          <p>
            Aplicamos criptografia de padrão internacional em todas as camadas da aplicação:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-[var(--text-primary)]">Em Trânsito:</strong> Todo o tráfego entre os navegadores/dispositivos móveis e os servidores do Tarefaí é obrigatoriamente criptografado via TLS (HTTPS) com certificados digitais atualizados e cifras criptográficas de alta segurança.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Em Repouso:</strong> Bancos de dados, backups e mídias de armazenamento em nuvem contam com criptografia AES-256 nativa, resguardando os dados gravados contra acessos físicos não autorizados.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Segredos e Chaves:</strong> Chaves de API, variáveis de ambiente sensíveis e certificados nunca são versionados em código-fonte, sendo gerenciados de forma isolada nos serviços de infraestrutura.
            </li>
          </ul>
        </section>

        {/* Seção 5 */}
        <section id="trilhas-auditoria" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            5. Trilhas de Auditoria e Integridade Operacional
          </h2>
          <p>
            Garantir a veracidade da execução é fundamental para operações de saúde, alimentação,
            indústria, varejo e serviços:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              Todas as conclusões de tarefas, conferências de itens e assinaturas registram carimbos de data/hora (timestamp) confiáveis e a identidade do operador responsável.
            </li>
            <li>
              Evidências anexadas (como fotografias ou anotações) são atreladas ao registro histórico imutável daquela execução, prevenindo exclusão retroativa ou adulteração.
            </li>
            <li>
              Ações administrativas críticas (alterações cadastrais de colaboradores, exclusão de modelos ou permissões de gestores) geram registros internos de log para fins de governança e auditoria.
            </li>
          </ul>
        </section>

        {/* Seção 6 */}
        <section id="resiliencia-backups" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            6. Resiliência, Backups e Continuidade de Negócio
          </h2>
          <p>
            Para assegurar que a sua operação não pare:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-[var(--text-primary)]">Rotinas de Backup:</strong> Cópias de segurança completas e incrementais dos bancos de dados são geradas periodicamente de forma automática, com retenção distribuída geograficamente.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Testes de Recuperação:</strong> Procedimentos de restauração são verificados regularmente para garantir o cumprimento dos objetivos de tempo de recuperação (RTO) e ponto de recuperação (RPO).
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Alta Disponibilidade:</strong> A infraestrutura utiliza serviços em nuvem escaláveis com balanceamento de carga e tolerância a falhas de instâncias individuais.
            </li>
          </ul>
        </section>

        {/* Seção 7 */}
        <section id="protecao-rede" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            7. Proteção de Infraestrutura e Redes
          </h2>
          <p>
            A camada de rede e aplicação conta com controles de proteção perimetral:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              Mitigação de ataques de negação de serviço distribuída (DDoS);
            </li>
            <li>
              Mecanismos de Rate Limiting para prevenir abuso de rotas de login, envio de formulários e pesquisas automatizadas;
            </li>
            <li>
              Políticas de cabeçalhos de segurança HTTP (como Content-Security-Policy, HSTS, X-Content-Type-Options e Referrer-Policy);
            </li>
            <li>
              Validação estrita de esquemas de entrada de dados para eliminação de vetores de injeção de código (SQL Injection, XSS e CSRF).
            </li>
          </ul>
        </section>

        {/* Seção 8 */}
        <section id="gestao-vulnerabilidades" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            8. Gestão de Vulnerabilidades e Incidentes
          </h2>
          <p>
            Mantemos um ciclo contínuo de monitoramento de segurança:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-[var(--text-primary)]">Análise de Dependências:</strong> Ferramentas automatizadas analisam bibliotecas e pacotes externos em busca de vulnerabilidades conhecidas (CVEs), com aplicação ágil de patches de correção.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Resposta a Incidentes:</strong> Dispomos de protocolo interno documentado para detecção, contenção, mitigação e comunicação célere em caso de qualquer incidente de segurança relevante.
            </li>
          </ul>
        </section>

        {/* Seção 9 */}
        <section id="boas-praticas-usuario" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            9. Responsabilidades do Usuário e da Organização
          </h2>
          <p>
            A segurança da informação é um esforço compartilhado entre o Tarefaí e os seus clientes:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              Colaboradores devem manter o sigilo de seus PINs e senhas individuais, não compartilhando credenciais com outros membros da equipe;
            </li>
            <li>
              Gestores devem revogar imediatamente o acesso de colaboradores desligados ou transferidos de função;
            </li>
            <li>
              Aparelhos compartilhados em turnos de trabalho devem utilizar mecanismos de bloqueio de tela e encerramento de sessão ao término de cada jornada;
            </li>
            <li>
              Sempre acesse o sistema através de navegadores atualizados e do domínio oficial <code>tarefai.com.br</code>.
            </li>
          </ul>
        </section>

        {/* Seção 10 */}
        <section id="reporte-seguranca" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            10. Canal de Reporte de Vulnerabilidades e Contato
          </h2>
          <p>
            Incentivamos o reporte responsável de potenciais vulnerabilidades ou comportamentos inesperados
            na plataforma por pesquisadores de segurança, clientes e parceiros.
          </p>
          <div className="p-4 bg-[var(--canvas)] rounded-xl border border-[var(--border-subtle)] text-xs sm:text-sm space-y-1">
            <p><strong className="text-[var(--text-primary)]">Equipe de Segurança da Informação:</strong> seguranca@tarefai.com.br</p>
            <p><strong className="text-[var(--text-primary)]">Suporte ao Cliente:</strong> suporte@tarefai.com.br</p>
            <p><strong className="text-[var(--text-primary)]">Divulgação Responsável:</strong> avaliamos relatórios de segurança com alta prioridade e solicitamos que pesquisadores não divulguem publicamente detalhes até a conclusão da mitigação.</p>
          </div>
        </section>
      </div>
    </article>
  );
}
