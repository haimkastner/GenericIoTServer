import * as chai from 'chai';
import { expect } from 'chai';
import chaiHttp = require('chai-http');
import app from '../App';
import { Minion } from '../models/interfaces';

chai.use(chaiHttp);
const agent = chai.request.agent(app);

describe('Minions routing API', () => {

    describe('/GET minions', () => {
        it('it should respond 20x as status code', (done) => {
            agent.get('/API/minions')
                .end((err, res) => {
                    expect(res.statusType).eql(2);
                    done();
                });
        });
    });

    describe('/GET minions/{minionId}', () => {
        it('it should respond 20x as status code', (done) => {
            agent.get('/API/minions/minionId')
                .end((err, res) => {
                    expect(res.statusType).eql(2);
                    done();
                });
        });
    });

    describe('/POST minions', () => {
        it('it should respond 20x as status code', (done) => {
            const minion: Minion = {
                device: {
                    brand: '',
                    model: '',
                    mac: '',
                },
                isProperlyCommunicated: true,
                minionId: 'vf',
                minionType: 'light',
                name: 'dfdf',
                minionStatus: {

                },
            };
            agent.post('/API/minions')
                .send(minion)
                .end((err, res) => {
                    expect(res.statusType).eql(2);
                    done();
                });
        });
    });

    describe('/PUT minions/{minionId}', () => {
        it('it should respond 20x as status code', (done) => {
            const minion: Minion = {
                device: {
                    brand: '',
                    model: '',
                    mac: '',
                },
                isProperlyCommunicated: true,
                minionId: 'vf',
                minionType: 'light',
                name: 'dfdf',
                minionStatus: {

                },
            };
            agent.put('/API/minions/minionId')
                .send(minion)
                .end((err, res) => {
                    expect(res.statusType).eql(2);
                    done();
                });
        });
    });

    describe('/DELETE minions/{minionId}', () => {
        it('it should respond 20x as status code', (done) => {
            agent.del('/API/minions/minionId')
                .end((err, res) => {
                    expect(res.statusType).eql(2);
                    done();
                });
        });
    });

    describe('/PUT minions/timeout/{minionId}', () => {
        it('it should respond 20x as status code', (done) => {
            const minion: Minion = {
                device: {
                    brand: '',
                    model: '',
                    mac: '',
                },
                isProperlyCommunicated: true,
                minionId: 'vf',
                minionType: 'light',
                name: 'dfdf',
                minionStatus: {

                },
            };
            agent.put('/API/minions/timeout/minionId')
                .send(minion)
                .end((err, res) => {
                    expect(res.statusType).eql(2);
                    done();
                });
        });
    });

    describe('/POST minions/command/{minionId}', () => {
        it('it should respond 20x as status code', (done) => {
            const minion: Minion = {
                device: {
                    brand: '',
                    model: '',
                    mac: '',
                },
                isProperlyCommunicated: true,
                minionId: 'vf',
                minionType: 'light',
                name: 'dfdf',
                minionStatus: {

                },
            };
            agent.post('/API/minions/command/minionId')
                .send(minion)
                .end((err, res) => {
                    expect(res.statusType).eql(2);
                    done();
                });
        });
    });

    describe('/POST minions/rescan', () => {
        it('it should respond 20x as status code', (done) => {
            agent.post('/API/minions/rescan')
                .end((err, res) => {
                    expect(res.statusType).eql(2);
                    done();
                });
        });
    });
});
