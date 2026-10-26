import type { Metadata } from "next";
import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description:
    "Conheça as condições, diretrizes e responsabilidades para o uso da plataforma Tarefaí por organizações, gestores e colaboradores.",
};

export default function TermsOfUsePage() {
  return (
    <article className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl p-6 sm:p-10 shadow-xs">
      {/* Cabeçalho do documento */}
      <header className="border-b border-[var(--border-subtle)] pb-8 mb-8">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--brand-700)] uppercase tracking-wider mb-2">
          <FileText className="size-4" />
          <span>Contrato de Uso & Termos Gerais de Serviço</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          Termos de Uso
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
          <span>Última atualização: 24 de outubro de 2026</span>
          <span className="hidden sm:inline">•</span>
          <span>Versão 1.1</span>
          <span className="hidden sm:inline">•</span>
          <span>Condições Gerais de Acesso e Utilização da Plataforma</span>
        </div>

        <p className="mt-4 text-sm sm:text-[15px] text-[var(--text-secondary)] leading-relaxed">
          Estes Termos de Uso regulam o acesso e a utilização dos serviços oferecidos pela plataforma
          Tarefaí. Ao acessar o sistema, cadastrar sua organização ou utilizar suas credenciais
          operacionais (seja via PIN, senha ou biometria), você declara ter lido, compreendido e
          concordado integralmente com as condições aqui estabelecidas.
        </p>

        {/* Alternador rápido para política de privacidade e segurança */}
        <div className="mt-5 p-3.5 bg-[var(--canvas)] rounded-xl border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <span className="text-[var(--text-secondary)]">
            Deseja consultar nossas políticas de proteção de dados e segurança da informação?
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/privacidade"
              className="inline-flex items-center gap-1 font-semibold text-[var(--brand-700)] hover:text-[var(--brand-900)]"
            >
              <span>Privacidade</span>
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
            <li><a href="#aceitacao" className="hover:text-[var(--brand-900)]">Aceitação e Adesão</a></li>
            <li><a href="#objeto" className="hover:text-[var(--brand-900)]">Objeto e Descrição dos Serviços</a></li>
            <li><a href="#acesso-contas" className="hover:text-[var(--brand-900)]">Acesso e Cadastro de Colaboradores</a></li>
            <li><a href="#credenciais" className="hover:text-[var(--brand-900)]">Credenciais e Responsabilidade de Acesso</a></li>
            <li><a href="#conduta" className="hover:text-[var(--brand-900)]">Regras de Conduta e Uso Aceitável</a></li>
            <li><a href="#evidencias-conteudo" className="hover:text-[var(--brand-900)]">Evidências e Registros Operacionais</a></li>
            <li><a href="#disponibilidade" className="hover:text-[var(--brand-900)]">Disponibilidade e Manutenção</a></li>
            <li><a href="#propriedade-intelectual" className="hover:text-[var(--brand-900)]">Propriedade Intelectual</a></li>
            <li><a href="#limitacao-responsabilidade" className="hover:text-[var(--brand-900)]">Limitação de Responsabilidade</a></li>
            <li><a href="#rescisao" className="hover:text-[var(--brand-900)]">Suspensão e Encerramento</a></li>
            <li><a href="#alteracoes" className="hover:text-[var(--brand-900)]">Alterações nos Termos</a></li>
            <li><a href="#legislacao-foro" className="hover:text-[var(--brand-900)]">Legislação e Foro</a></li>
          </ol>
        </nav>
      </section>

      {/* Conteúdo textual */}
      <div className="space-y-8 text-sm sm:text-[15px] leading-relaxed text-[var(--text-secondary)]">
        {/* Seção 1 */}
        <section id="aceitacao" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            1. Aceitação e Adesão aos Termos
          </h2>
          <p>
            O Tarefaí é disponibilizado como Software como Serviço (SaaS) para organizações,
            empresas e seus respectivos colaboradores autorizados. A adesão a estes Termos
            ocorre formalmente no momento da contratação dos serviços pela Organização Contratante
            e/ou no primeiro acesso de cada usuário individual à plataforma.
          </p>
          <p>
            Caso você não concorde com qualquer disposição destes Termos, você não deverá
            acessar ou utilizar a plataforma.
          </p>
        </section>

        {/* Seção 2 */}
        <section id="objeto" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            2. Objeto e Descrição dos Serviços
          </h2>
          <p>
            O Tarefaí fornece uma plataforma digital integrada para:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              Criação, distribuição, agendamento e execução de tarefas avulsas e rotinas operacionais;
            </li>
            <li>
              Padronização de processos corporativos através de formulários, checklists e modelos (templates);
            </li>
            <li>
              Coleta de comprovações de execução (como assinaturas eletrônicas, fotos, respostas obrigatórias e carimbos de data/hora);
            </li>
            <li>
              Painéis de acompanhamento em tempo real e relatórios operacionais para lideranças e gestores.
            </li>
          </ul>
        </section>

        {/* Seção 3 */}
        <section id="acesso-contas" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            3. Acesso e Cadastro de Colaboradores
          </h2>
          <p>
            A Organização Contratante é a responsável exclusiva pela criação, atribuição de permissões,
            definição de cargos, inclusão e desativação dos colaboradores cadastrados em sua conta.
          </p>
          <p>
            O colaborador cadastrado compromete-se a fornecer informações verídicas e a utilizar a
            plataforma unicamente no exercício de suas atribuições profissionais designadas pela empresa.
          </p>
        </section>

        {/* Seção 4 */}
        <section id="credenciais" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            4. Credenciais e Responsabilidade de Acesso
          </h2>
          <p>
            O sistema oferece diferentes métodos de autenticação de acordo com o perfil operacional:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-[var(--text-primary)]">PIN Individual:</strong> Código numérico pessoal e intransferível utilizado para autenticação rápida de operadores e equipes de turno.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">E-mail e Senha:</strong> Utilizado por gestores e administradores, exigindo guarda sigilosa e não compartilhamento.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Biometria do Dispositivo (WebAuthn):</strong> Vinculação do hardware pessoal ou corporativo para agilidade e segurança local.
            </li>
          </ul>
          <p>
            O usuário e a organização contratante são integralmente responsáveis por todos os atos
            praticados sob suas respectivas credenciais. Em caso de extravio, perda ou suspeita de
            comprometimento de PIN ou senha, o colaborador deve notificar imediatamente o gestor da unidade.
          </p>
        </section>

        {/* Seção 5 */}
        <section id="conduta" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            5. Regras de Conduta e Uso Aceitável
          </h2>
          <p>
            É expressamente vedado ao usuário e à organização contratante:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              Inserir dados falsos, forjar conclusões de tarefas operacionais ou burlar itens de checagem obrigatórios;
            </li>
            <li>
              Utilizar dispositivos ou scripts automatizados para scraping, sobrecarga de requisições ou ataques de negação de serviço (DoS/DDoS);
            </li>
            <li>
              Tentar contornar mecanismos de autenticação, permissões de acesso ou o isolamento lógico entre organizações (multi-tenancy);
            </li>
            <li>
              Descompilar, realizar engenharia reversa ou tentar extrair o código-fonte proprietário da plataforma;
            </li>
            <li>
              Fazer upload de arquivos que contenham vírus, malwares, códigos maliciosos ou conteúdo manifestamente ilícito.
            </li>
          </ul>
        </section>

        {/* Seção 6 */}
        <section id="evidencias-conteudo" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            6. Evidências e Registros Operacionais
          </h2>
          <p>
            Todas as evidências submetidas (como fotografias anexadas, notas de execução, checklists
            preenchidos e assinaturas registradas) passam a compor o histórico auditável da tarefa na organização.
          </p>
          <p>
            A Organização Contratante é responsável pela legalidade, veracidade e conformidade trabalhista
            e regulatória dos dados e mídias inseridos por seus colaboradores no curso de suas atividades.
          </p>
        </section>

        {/* Seção 7 */}
        <section id="disponibilidade" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            7. Disponibilidade e Manutenção do Sistema
          </h2>
          <p>
            O Tarefaí emprega esforços técnicos para assegurar altos índices de disponibilidade e estabilidade
            operacional. Não obstante:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              O serviço poderá sofrer interrupções temporárias e pontuais para manutenções preventivas, corretivas ou atualizações de melhoria, preferencialmente agendadas em horários de menor impacto operacional;
            </li>
            <li>
              O sistema não se responsabiliza por interrupções decorrentes de falhas em conexões locais de internet, provedores de telecomunicações ou falhas físicas em dispositivos móveis e computadores dos usuários;
            </li>
            <li>
              A plataforma implementa suporte a persistência local transitória para evitar perda de dados durante oscilações momentâneas de sinal de rede.
            </li>
          </ul>
        </section>

        {/* Seção 8 */}
        <section id="propriedade-intelectual" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            8. Propriedade Intelectual
          </h2>
          <p>
            O software Tarefaí, suas marcas, logotipos, interfaces, estruturas de banco de dados, códigos-fonte
            e documentações são de propriedade exclusiva de seus desenvolvedores e mantenedores, estando
            protegidos pela Lei de Direitos Autorais (Lei nº 9.610/1998) e pela Lei de Propriedade Industrial (Lei nº 9.279/1996).
          </p>
          <p>
            A contratação confere à organização uma licença de uso limitada, não exclusiva, intransferível e
            revogável, estritamente vinculada ao período de vigência da assinatura. Todos os dados operacionais
            gerados pela organização contratante pertencem a ela.
          </p>
        </section>

        {/* Seção 9 */}
        <section id="limitacao-responsabilidade" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            9. Limitação de Responsabilidade
          </h2>
          <p>
            O Tarefaí atua como ferramenta tecnológica facilitadora da gestão e execução operacional. Em nenhuma hipótese:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              O Tarefaí será responsável pela qualidade técnica, sanitária, legal ou laboral das tarefas executadas na operação física da organização contratante;
            </li>
            <li>
              Haverá responsabilização por lucros cessantes, perdas de oportunidade comercial ou danos indiretos resultantes do uso ou da impossibilidade de uso da plataforma;
            </li>
            <li>
              Seremos responsáveis por decisões administrativas, disciplinares ou operacionais tomadas pelos gestores com base nas informações registradas no sistema.
            </li>
          </ul>
        </section>

        {/* Seção 10 */}
        <section id="rescisao" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            10. Suspensão e Encerramento de Contas
          </h2>
          <p>
            O Tarefaí reserva-se o direito de suspender ou encerrar o acesso de organizações ou colaboradores específicos em caso de:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Violação comprovada de qualquer das cláusulas destes Termos de Uso ou das Políticas de Segurança;</li>
            <li>Inadimplência financeira referente à assinatura corporativa contratada;</li>
            <li>Constatação de atividades ilícitas, fraudulentas ou tentativas deliberadas de invadir contas e sistemas;</li>
            <li>Determinação de autoridade judicial ou regulatória competente.</li>
          </ul>
        </section>

        {/* Seção 11 */}
        <section id="alteracoes" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            11. Alterações nos Termos de Uso
          </h2>
          <p>
            Estes Termos de Uso poderão ser atualizados periodicamente para refletir melhorias no sistema, novas
            funcionalidades ou adequações regulatórias. A data da versão mais recente estará sempre indicada no topo
            desta página.
          </p>
          <p>
            A continuidade no uso da plataforma após a publicação de modificações substanciais implica na concordância
            tácita com os novos termos.
          </p>
        </section>

        {/* Seção 12 */}
        <section id="legislacao-foro" className="space-y-3 pt-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
            12. Legislação Aplicável e Foro
          </h2>
          <p>
            Estes Termos são regidos e interpretados em conformidade com as leis da República Federativa do Brasil.
            Fica eleito o Foro da Comarca da sede da empresa mantenedora do Tarefaí para dirimir quaisquer controvérsias
            oriundas deste instrumento, com expressa renúncia a qualquer outro, por mais privilegiado que seja.
          </p>
          <div className="p-4 bg-[var(--canvas)] rounded-xl border border-[var(--border-subtle)] text-xs sm:text-sm space-y-1 mt-4">
            <p><strong className="text-[var(--text-primary)]">Canal de Atendimento e Suporte:</strong> suporte@tarefai.com.br</p>
            <p><strong className="text-[var(--text-primary)]">Dúvidas Jurídicas e Contratuais:</strong> juridico@tarefai.com.br</p>
          </div>
        </section>
      </div>
    </article>
  );
}
