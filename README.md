# Poc Cascading Engine

The purpose of this project is to prove we can build a simple engine that can deal with Consistency and Completeness
in a orthogonal way, instead of having a pure functional approach of the cascading.

The project is a node/ts project.

Usage :

```bash
yarn install
yarn docker:up
yarn start
yarn docker:down
```

You can visualize the DB directly using the provided pgAdmin container.

```
http://localhost:5050/
login : root@metroscope.tech
pwd : root
dbPwd : root
```
