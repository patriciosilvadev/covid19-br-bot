const getData = require('../lib/getData');
const fs = require('fs');
const path = require('path');
const dateformat = require('dateformat');
const { JSDOM } = require('jsdom');
const d3 = require('d3');

function generateMetadata(ctx, date){
  const obj = {
    name: `${ctx.from.id}${dateformat(date, 'ddmmhhMMss')}`,
  };
  obj.svg = path.join(__dirname, '../data', `${obj.name}.svg`);
  obj.png = path.join(__dirname, '../data', `${obj.name}.png`)
  return obj;
}

function generateSvg(ctx, results) {
  const html = '<body><svg /></body>';
  const dom = new JSDOM(html);
  const body = d3.select(dom.window.document).select('body');

  // Sample data
  const __data__ = [];
  for (let i=results.length-1; i>=0; i--){
    __data__.push({
      date: dateformat(results[i].date, 'dd/mm'),
      value: results[i].confirmed
    });
  }

  // build
  const margin = 30;
  const width = 720;
  const height = 520;
  const f = 1.6;

  const svg = body.select('svg');
  svg.attr("version", "1.1")
    .attr("xmlns", d3.namespaces.svg)
    .attr("xmlns:xlink", d3.namespaces.xlink)
    .attr('width', width)
    .attr('height', height);
  
  const chart = svg.append('g')
        .attr('transform', `translate(${margin}, ${margin})`);

  const yScale = d3.scaleLinear()
        .range([height - (margin * f), 0])
        .domain([0, __data__[__data__.length - 1].value]);

  chart.append('g')
    .call(d3.axisLeft(yScale));

  const xScale = d3.scaleBand()
        .range([0, width])
        .domain(__data__.map((s) => s.date))
        .padding(0.75)

  chart.append('g')
    .attr('transform', `translate(0, ${height - (margin * f)})`)
    .call(d3.axisBottom(xScale));

  chart.selectAll()
    .data(__data__)
    .enter()
    .append('rect')
    .attr('x', (s) => xScale(s.date))
    .attr('y', (s) => yScale(s.value))
    .attr('height', (s) => height - (margin * f) - yScale(s.value))
    .attr('width', xScale.bandwidth())

  return dom.window.document.body.innerHTML;
};

function saveSvg(src, metadata, logger){
  return new Promise(function(resolve, reject){
    let now2 = new Date();
    logger.info(`${now2} === Saving ${metadata.svg} (${now2 - metadata.now}ms)`);
    fs.writeFile(metadata.svg, src, function(err){
      if (err) reject(err);
      resolve();
    });
  });
}

function convertSvg2Png(metadata, logger) {
  return new Promise(function(resolve, reject){
    let now2 = new Date();
    logger.info(`${now2} === Converting to ${metadata.png}`)
    const __convert__ = require('child_process').spawn("convert", [
      metadata.svg,
      metadata.png
    ]);
    __convert__.on('error', function(err){
      reject(err)
    });
    __convert__.on('exit', function(code){
      if (code === 0){
        resolve();
      } else {
        reject(new Error('Unknown error'));
      }
    });
  });
}

function replyWithPngImage(ctx, metadata, logger){
  return new Promise(function(resolve, reject){
    let now = new Date();
    logger.info(`${now} === Success, sending photo`);
    try {
      ctx.replyWithPhoto({source: fs.readFileSync(metadata.png)});
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = function(session, logger){
  return async function(ctx) {
    const __arg__ = ctx.message.text.split("/casos ")[1];
    const results = await getData(logger, {
      state: ctx.session.state,
      city: ctx.session.city
    });
    if (typeof(results) === 'array' && results.length === 0){
      ctx.reply('Nenhum dado encontrado');
    }
    else if(typeof(results) === 'string'){
      ctx.reply(results);
    }
    else {
      const __arg__ = ctx.message.text.split("/casos ")[1];
      if(__arg__ === "confirmados"){
        ctx.reply(`Existem ${results[0]["confirmed"]} casos confirmados`);
      }
      if(__arg__ === "porcentagem"){
        ctx.reply(`Existem ${results[0]["confirmed_per_100k_inhabitants"]}% de casos confirmados para cada 100.000 pessoas`);
      }
      if(__arg__ === "óbitos") {
        ctx.reply(`${results[0]["deaths"]} óbitos computados`);
      }
      if(__arg__ === "lista") {
        const msg = [
          "Lista de data/casos:",
          ""
        ];
        for (let i in results){
          msg.push(`${results[i].date}: ${results[i].confirmed} casos`);
        }
        ctx.reply(msg.join("\n"));
      }
      if(__arg__ === "gráfico"){
        let date = new Date();
        logger.info(`${date} === Generating metadata`);
        const metadata = generateMetadata(ctx, date);

        let date2 = new Date();
        logger.info(`${date2} === Generating svg (${date2 - date}ms)`);
        const svg = generateSvg(ctx, results);
        try{
          await saveSvg(svg, metadata, logger);
          await convertSvg2Png(metadata, logger);
          await replyWithPngImage(ctx, metadata, logger);
        } catch (err) {
          logger.error(err);
          ctx.reply(err.message);
        }
      }
    }
  };
};
