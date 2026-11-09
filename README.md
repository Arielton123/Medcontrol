# MEDCONTROL - Sistema de Gestão Hospitalar (protótipo acadêmico)

Aplicação web construída com React, TypeScript, Vite e Supabase (PostgreSQL + Auth). O front-end é publicado no GitHub Pages e os dados ficam no Supabase: o computador do aluno não funciona como servidor.

> **Uso exclusivamente acadêmico.** Todos os dados de demonstração são fictícios. Não cadastre pacientes reais, informações clínicas reais, documentos, contatos ou prontuários verdadeiros. Este protótipo não é um sistema clínico certificado e não deve orientar diagnósticos, tratamentos ou prescrições.

## Funcionalidades incluídas

- Cadastro e login por e-mail e senha usando Supabase Auth.
- Perfil automático com função inicial `reception`.
- Painel com indicadores, próximas consultas e alerta de estoque baixo.
- CRUD de pacientes, médicos, consultas, prontuários, medicamentos e prescrições.
- Pesquisa textual nas tabelas, edição e exclusão de registros.
- Seleção de relações por campos de chave estrangeira.
- Validação de campos obrigatórios, quantidade não negativa, duração positiva e conflito de horário de consulta (janela fixa de 30 minutos).
- Políticas de autorização no PostgreSQL usando Row Level Security (RLS).
- Registros fictícios iniciais nas seis tabelas operacionais.

## Estrutura do repositório

```text
medcontrol/
├── .github/workflows/deploy.yml   # publicação automática no GitHub Pages
├── database/schema.sql            # tabelas, relações, RLS, gatilho e dados fictícios
├── public/favicon.svg             # ícone do navegador
├── src/App.tsx                    # autenticação, painel e telas de gestão
├── src/lib/data.ts                # consultas, gravações, exclusões e validação
├── src/lib/supabase.ts            # conexão com Supabase
├── src/index.css                  # identidade visual responsiva
├── .env.example                   # nomes das variáveis necessárias
├── .gitignore                     # impede envio de dependências e arquivos secretos
├── index.html
├── package.json
└── vite.config.ts                 # caminho do projeto no GitHub Pages
```

## Publicar totalmente pela internet (sem servidor local)

### 1. Criar o repositório no GitHub

1. Entre em https://github.com e faça login.
2. Clique em **New repository**.
3. Use exatamente o nome `medcontrol` (o `base` do Vite já está configurado para esse nome).
4. Marque **Public** para que o GitHub Pages funcione normalmente em uma conta gratuita, deixe a opção de README desmarcada e crie o repositório.
5. Extraia o arquivo ZIP do MEDCONTROL e abra a pasta `medcontrol`.
6. No repositório, escolha **Add file > Upload files** e envie o CONTEÚDO dessa pasta (por exemplo, `package.json`, `src`, `database` e `.github`), e não a pasta externa como uma única subpasta. Preserve a estrutura interna e faça o primeiro commit na branch `main`.
7. Se a interface de upload não preservar a pasta oculta `.github`, crie manualmente o arquivo `.github/workflows/deploy.yml` em **Add file > Create new file**, cole o conteúdo do arquivo correspondente deste projeto e confirme o commit.

### 2. Criar o banco de dados no Supabase

1. Entre em https://supabase.com e crie um projeto.
2. Defina nome do projeto, senha forte do banco e região disponível mais próxima.
3. Aguarde a criação do banco.
4. Abra **SQL Editor > New query**.
5. Abra `database/schema.sql` deste pacote, copie o conteúdo completo, cole no editor do Supabase e clique em **Run**.
6. A execução cria sete tabelas (`user_profiles`, `patients`, `doctors`, `appointments`, `medical_records`, `medications`, `prescriptions`), chaves, índices, políticas RLS, gatilho de perfil e cinco registros fictícios em cada tabela.
7. Confira em **Table Editor** se as tabelas foram criadas.

### 3. Copiar as credenciais públicas do projeto

1. No Supabase, abra **Project Settings > API Keys** (ou **Connect**, conforme a interface exibida).
2. Copie a **Project URL**.
3. Copie a chave **Publishable** do projeto. Em projetos que ainda exibem a chave legada, a chave `anon` também pode ser usada.
4. **Nunca copie a chave `service_role` para o site, para o GitHub ou para qualquer arquivo do navegador.** A chave pública só pode ser utilizada com RLS corretamente configurado.

### 4. Configurar os Secrets do GitHub

1. Abra o repositório `medcontrol`.
2. Vá em **Settings > Secrets and variables > Actions**.
3. Clique em **New repository secret** e crie:
   - `VITE_SUPABASE_URL` = Project URL copiada do Supabase.
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = chave Publishable (ou anon legada).
4. Salve os dois Secrets.

Esses valores são injetados durante a compilação do site. A chave Publishable/anon é pública por definição; a segurança dos dados depende das políticas RLS. A chave `service_role` não deve ser usada no front-end.

### 5. Ativar a publicação automática

1. No GitHub, abra **Settings > Pages**.
2. Em **Build and deployment > Source**, selecione **GitHub Actions**.
3. Abra a aba **Actions** do repositório.
4. Aguarde o fluxo **Publicar MEDCONTROL no GitHub Pages** terminar com status verde. Se houver falha, abra o fluxo e veja a etapa que apresentou erro.
5. O endereço esperado será `https://SEU-USUARIO.github.io/medcontrol/`.

O arquivo `.github/workflows/deploy.yml` instala as dependências, executa `npm run build` e publica a pasta `dist`. Cada novo commit na branch `main` dispara uma nova publicação.

### 6. Ajustar URLs de autenticação

No Supabase, abra **Authentication > URL Configuration**. Defina a **Site URL** como `https://SEU-USUARIO.github.io/medcontrol/` e adicione esse endereço à lista de **Redirect URLs**. Substitua `SEU-USUARIO` pelo seu nome de usuário real do GitHub.

### 7. Criar a primeira conta e definir o perfil

1. Abra o endereço publicado.
2. Clique em **Criar conta**, informe nome, e-mail e senha com pelo menos 8 caracteres.
3. Se a confirmação por e-mail estiver habilitada, abra o e-mail de confirmação antes de entrar.
4. O banco cria automaticamente um perfil vinculado à conta com função `reception`. Os cinco perfis fictícios iniciais servem apenas para demonstrar a tabela e não são contas de login.
5. Para transformar sua própria conta de teste em administradora, execute no SQL Editor do Supabase (substitua o e-mail):

```sql
update public.user_profiles
set role = 'admin'
where auth_user_id = (
  select id from auth.users where email = 'SEU_EMAIL_DE_TESTE'
);
```

6. Saia do sistema e entre novamente para recarregar as permissões.

Funções disponíveis: `admin`, `reception`, `doctor` e `pharmacy`. A atribuição de funções é administrativa e não pode ser feita pelo próprio formulário público de cadastro.

### 8. Testar as funcionalidades

- **Pacientes:** crie, pesquise, edite e exclua um paciente de demonstração.
- **Médicos:** disponível para o perfil `admin`.
- **Consultas:** selecione paciente e médico; o sistema recusa horários passados, médicos inativos e conflitos de 30 minutos para o mesmo profissional.
- **Prontuários e prescrições:** disponíveis para os perfis `admin` e `doctor`; use exclusivamente textos demonstrativos.
- **Medicamentos:** consulte o catálogo; perfis `admin` e `pharmacy` podem editar estoque.
- **Exclusões:** o PostgreSQL impede a exclusão de registros que ainda são referenciados por outros registros, preservando a integridade relacional.

## Papéis e permissões

| Recurso | admin | reception | doctor | pharmacy |
|---|---:|---:|---:|---:|
| Consultar médicos e medicamentos | Sim | Sim | Sim | Sim |
| Gerenciar pacientes | Sim | Sim | Sim | Não |
| Gerenciar consultas | Sim | Sim | Sim | Não |
| Gerenciar prontuários e prescrições | Sim | Não | Sim | Não |
| Gerenciar médicos | Sim | Não | Não | Não |
| Gerenciar medicamentos/estoque | Sim | Não | Consulta | Sim |

As políticas do banco são a barreira efetiva de autorização. A interface também oculta menus incompatíveis com o papel do usuário, mas ocultar um botão nunca substitui RLS.

## Lógica principal: agendamento

1. O usuário informa paciente, médico, data, horário e motivo.
2. O navegador valida os campos obrigatórios e converte a data para ISO 8601.
3. O sistema rejeita uma data passada.
4. O sistema consulta os agendamentos do médico em uma janela de 30 minutos e verifica sobreposição.
5. Se houver conflito, informa o usuário e não grava.
6. Caso contrário, grava a consulta. A chave estrangeira garante que paciente e médico existam.

**Limitação técnica importante:** a checagem de conflito do protótipo ocorre no cliente antes da gravação. Em uma implantação clínica real, a regra deve ser reforçada no banco ou em uma API transacional para evitar duas gravações simultâneas que passem na checagem ao mesmo tempo.

## Desenvolvimento e manutenção

Este projeto já contém o código-fonte e a automação de publicação. Para alterar o projeto sem instalar programas, é possível editar arquivos pelo próprio GitHub (por exemplo, em `github.dev` ou pela criação/edição de arquivos no repositório) e fazer commit na branch `main`. O GitHub Actions faz a compilação e publica a versão atualizada.

Para desenvolvimento local opcional, use Node.js 22, `npm install` e `npm run dev`. Essa etapa não é necessária para manter o site publicado.

## Limites e segurança

- Não utilizar dados reais de pacientes ou profissionais.
- O projeto não é certificado nem validado para operação hospitalar.
- Não contém prescrição clínica, cálculo de dose, prontuário oficial, integração com laboratório, convênios, sistemas do SUS ou certificação digital.
- A proteção de dados de saúde envolve obrigações legais e técnicas que vão além deste exemplo acadêmico. A LGPD classifica dados referentes à saúde como dados pessoais sensíveis.
- Antes de qualquer uso real, seria necessária análise jurídica, de segurança, de privacidade, de infraestrutura, de continuidade e validação por profissionais habilitados.
