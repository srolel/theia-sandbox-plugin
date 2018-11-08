import * as serveStatic from 'serve-static';
import * as http from 'http';
import * as finalhandler from 'finalhandler';
import * as express from 'express';
import * as ts from 'typescript';
import * as fs from 'fs';
import { promisify } from 'util';
import { join } from 'path';
import { TransformerFactory, SourceFile } from 'typescript';

const readFileAsync = promisify(fs.readFile);

class TSCompiler {
    cdn = `https://dev.jspm.io`;

    replaceImportWithCdn = (node: ts.Node) => {

        if (ts.isImportDeclaration(node)) {
            const specifier = node.moduleSpecifier;
            if (ts.isStringLiteral(specifier)) {
                const newSpecifier = `${this.cdn}/${specifier.text}`;
                return ts.createImportDeclaration(
                    node.decorators,
                    node.modifiers,
                    node.importClause,
                    ts.createStringLiteral(newSpecifier)
                )
            }
        }
        return node;
    }

    transformImports: TransformerFactory<SourceFile> = (context) => (node) => {
        return ts.visitEachChild(node, this.replaceImportWithCdn, context);
    };
    options: ts.TranspileOptions = {
        compilerOptions: {
            module: 5,
            target: 5
        },
        transformers: {
            after: [this.transformImports]
        }
    }

    async compile(path: string) {
        const file = await readFileAsync(path);
        const compiled = ts.transpileModule(file.toString(), this.options);
        return compiled.outputText;
    }
}

export class StaticServer {

    server: http.Server | null = null;

    constructor(public options: { port: number }) { }

    tsCompiler = new TSCompiler();

    serveOptions: serveStatic.ServeStaticOptions = {
        setHeaders(res, path) {
            res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3030');
        }
    }


    async start(path: string) {
        await this.stop();
        const app = express();
        app.use('**/*.ts', async (req, res, next) => {
            const compiled = await this.tsCompiler.compile(join(path, req.originalUrl));
            res.writeHead(200, { "Content-Type": "application/javascript" })
            res.end(compiled);
        });
        app.use(serveStatic(path, this.serveOptions));
        app.listen(this.options.port);
    }

    stop() {
        return new Promise(r => {
            if (this.server) this.server!.close(r)
            else r();
        });
    }
}

new StaticServer({ port: 4000 }).start('./');