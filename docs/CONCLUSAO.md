# Capítulo 4 — Conclusão

> **Rascunho para o documento do TCC.** Extensão: 543 palavras, dentro da faixa
> de 400 a 600. As dificuldades relatadas saíram dos LEIAMEs de cada módulo e do
> histórico de commits — são defeitos e decisões registrados no momento em que
> aconteceram, não reconstituídos depois.

---

## 4.1 O projeto e seu desenvolvimento

O SGA TI é um sistema web para gestão de assistências técnicas de informática,
desenvolvido em Node.js com Express, Prisma e MySQL, com interface renderizada no
servidor em EJS. Cobre o ciclo completo de um atendimento: cadastro de cliente e
equipamento, abertura da ordem de serviço, orçamento, registro dos serviços
executados com controle de garantia, consumo de peças do estoque, faturamento e
relatórios gerenciais. O acesso é segmentado em seis perfis, e o cliente
acompanha o próprio conserto por uma consulta pública, sem autenticação.

O desenvolvimento foi dividido em cinco módulos entregues em sequência, cada um
em branch própria, documentado com suas regras de negócio e decisões de
modelagem, e coberto por testes automatizados. A suíte final reúne 449 casos,
executados a cada alteração por integração contínua contra um servidor MySQL.
Dois requisitos não funcionais foram incorporados ao final: rastreabilidade das
operações e política de retenção de dados pessoais.

## 4.2 Dificuldades encontradas

A principal dificuldade não foi de programação, mas de modelagem. Três dos quatro
relatórios previstos não tinham de onde extrair dado. Agrupar serviços pela
descrição em texto livre produziria um grupo por registro — "troca de tela" e
"Troca da tela" seriam serviços distintos —, o que exigiu criar um catálogo de
tipos de serviço. O relatório por tipo de equipamento exigiu um campo que não
existia, já que o cadastro guardava apenas marca e modelo. O de produtos mais
vendidos exigiu data própria no item da ordem de serviço, pois usar a data da OS
contaria uma peça de agosto como venda de julho. Requisito que não foi
confrontado com o modelo de dados durante a análise cobra esse preço na
implementação.

A segunda dificuldade foi a ausência de um servidor MySQL no ambiente de
desenvolvimento, o que levou a trabalhar com SQLite. A divergência entre os dois
bancos gerou defeitos reais: um campo de data gravado como texto deixou um
relatório permanentemente vazio, e o registro automático de auditoria, por ser
gravado durante uma transação, travou a aplicação por disputa de bloqueio de
escrita. Ambos só apareceram porque foram procurados.

A terceira foi o tratamento de fuso horário, que surgiu três vezes em contextos
distintos — na previsão de entrega, no nome do arquivo exportado e no do backup —
sempre pela mesma causa: converter a data para UTC quando a intenção era o
horário local.

Houve também divergências entre o documento e o sistema, como bibliotecas
citadas que o projeto não utiliza; foram registradas e tratadas como questão de
redação, sem alterar a arquitetura.

A última dificuldade foi perceber que dado pessoal não fica só onde é
cadastrado. A rotina de anonimização apagava o cliente, mas o faturamento já
havia copiado o nome para a descrição da conta a receber, e o registro de
auditoria guardava ambos. O vazamento apareceu numa captura de tela do manual,
não nos testes, que não cobriam aquele caminho.

## 4.3 Trabalhos futuros

Alguns caminhos permanecem abertos. A política de retenção define prazos, mas
nenhuma rotina os aplica: a anonimização ainda depende de pedido. A sessão e o controle de
tentativas de login vivem na memória do processo, o que basta para uma
assistência, mas não para operação com mais de uma instância. Por fim, a
avaliação de usabilidade com os usuários e os testes em navegadores e aparelhos
reais ainda precisam ser aplicados.
