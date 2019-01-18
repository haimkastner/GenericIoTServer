import * as moment from 'moment';
import * as randomstring from 'randomstring';
import { BehaviorSubject, Observable, Subscriber } from 'rxjs';
import { MinionsDal, MinionsDalSingleton } from '../data-layer/minionsDal';
import { DeviceKind, ErrorResponse, LocalNetworkDevice, Minion, MinionDevice, MinionStatus, MinionFeed } from '../models/sharedInterfaces';
import { ModulesManager, ModulesManagerSingltone } from '../modules/modulesManager';
import { logger } from '../utilities/logger';
import { Delay } from '../utilities/sleep';
import { DevicesBl, DevicesBlSingleton } from './devicesBl';

export class MinionsBl {

    // Dependecies
    private minionsDal: MinionsDal;
    private devicesBl: DevicesBl;
    private modulesManager: ModulesManager;

    /**
     * minions
     */
    private minions: Minion[] = [];

    /**
     * Minions status update feed.
     */
    public minionFeed = new BehaviorSubject<MinionFeed>(undefined);

    /**
     * Init minions bl. using dependecy injection pattern to allow units testings.
     * @param minionsDal Inject the dal instance.
     */
    constructor(minionsDal: MinionsDal, devicesBl: DevicesBl, modulesManager: ModulesManager) {

        this.minionsDal = minionsDal;
        this.devicesBl = devicesBl;
        this.modulesManager = modulesManager;

        logger.info('Starting init minions....');
        this.initData()
            .then(() => {
                logger.info('Init minions done');
            })
            .catch(() => {
                logger.error('Init minions fail.');
            });
    }

    /**
     * Init minions.
     */
    private async initData(): Promise<void> {
        /**
         * Gets all minions
         */
        this.minions = await this.minionsDal.getMinions();

        /**
         * Scan network on startup
         */
        await this.devicesBl.rescanNetwork();

        /**
         * Get network local devices
         */
        const localDevices = await this.devicesBl.getDevices();

        /**
         * Then load minion with new pysical network data
         */
        await this.loadMinionsLocalDeviceData(localDevices);

        /**
         * Finally get all minions status.
         */
        await this.readMinionsStatus();

        /**
         * After all registar to devices status updates.
         */
        this.modulesManager.minionStatusChangedEvent.subscribe((pysicalDeviceUpdate) => {
            const minion = this.getMinionsByMac(pysicalDeviceUpdate.mac);
            if (!minion) {
                logger.info(`Avoiding device update, there is no minion with mac: ${pysicalDeviceUpdate.mac}`);
                return;
            }

            minion.isProperlyCommunicated = true;
            minion.minionStatus = pysicalDeviceUpdate.status;
            this.minionFeed.next({
                event: 'update',
                minion,
            });
        });

        /**
         * And also Registar to devices pysical data update (name or ip).
         */
        this.devicesBl.devicesUpdate.subscribe((localsDevices: LocalNetworkDevice[]) => {
            this.loadMinionsLocalDeviceData(localsDevices);
        });
    }

    /**
     * Load minion devices data
     * @param localDevices local device array.
     */
    private async loadMinionsLocalDeviceData(localDevices: LocalNetworkDevice[]): Promise<void> {
        /**
         * Each device check each used minion.
         */
        for (const localDevice of localDevices) {
            for (const minion of this.minions) {
                if (minion.device.pysicalDevice.mac === localDevice.mac) {
                    minion.device.pysicalDevice = localDevice;
                }
            }
        }
    }

    /**
     * Read minoin current status.
     * @param minion minion to read status for.
     */
    private async readMinionStatus(minion: Minion): Promise<ErrorResponse> {
        const currentStatus: MinionStatus = await this.modulesManager.getStatus(minion)
            .catch((err: ErrorResponse) => {
                minion.isProperlyCommunicated = false;
                logger.warn(`Fail to read status of ${minion.name} id: ${minion.minionId} err : ${err.message}`);
                throw err;
            }) as MinionStatus;
        minion.isProperlyCommunicated = true;
        minion.minionStatus = currentStatus;
        return;
    }

    /**
     * Read each minion current status.
     */
    private async readMinionsStatus(): Promise<void> {
        for (const minion of this.minions) {

            /**
             * Read current minion status.
             */
            await this.readMinionStatus(minion)
                .catch(() => {
                    /**
                     * Id fail, do nothing....
                     */
                });

            /**
             * Let time between minions reading.
             * this is because some of devices using broadcast in netword and can't communication 2 together.
             */
            await Delay(moment.duration(1, 'seconds'));
        }
    }

    /**
     * Find minion in minions array.
     * @param minionId minioin id.
     */
    private findMinion(minionId: string): Minion {
        for (const minion of this.minions) {
            if (minion.minionId === minionId) {
                return minion;
            }
        }
    }

    /**
     * Validate new minion properties to make sure that they compatible to requires.
     * @param minionToCheck new minion to validate.
     */
    private validateNewMinion(minionToCheck: Minion): ErrorResponse {

        /**
         * Get brand & model
         */
        let deviceKind: DeviceKind;
        for (const kind of this.modulesManager.devicesKind) {
            if (kind.brand === minionToCheck.device.brand &&
                kind.model === minionToCheck.device.model) {
                deviceKind = kind;
            }
        }

        /**
         * Check that model exits in barns.
         */
        if (!deviceKind) {
            return {
                responseCode: 4222,
                message: 'there is no supported model for brand + model',
            };
        }

        /**
         * Check if token reqired and not exist.
         */
        if (deviceKind.isTokenRequierd && !minionToCheck.device.token) {
            return {
                responseCode: 4322,
                message: 'token is requird',
            };
        }

        /**
         * If cant be as logic minion, make sure that device not already.
         */
        if (!deviceKind.isUsedAsLogicDevice) {
            for (const minion of this.minions) {
                if (minion.device.pysicalDevice.mac === minionToCheck.device.pysicalDevice.mac) {
                    return {
                        responseCode: 4422,
                        message: 'device already in use at other minion',
                    };
                }
            }
        }

        /**
         * ignore user selection and set corrent minion type based on model.
         */
        minionToCheck.minionType = deviceKind.suppotedMinionType;
    }

    /**
     * Get minion by mac address.
     * Note that in minions that sharing same device (such as IR transmitter for 2 ac in same room)
     * it will return the first minion with given mac.
     * @param mac minion mac address.
     */
    private getMinionsByMac(mac: string): Minion {
        for (const minion of this.minions) {
            if (minion.device.pysicalDevice.mac === mac) {
                return minion;
            }
        }
    }

    /**
     * API
     */

    /**
     * Gets minons array.
     */
    public async getMinions(): Promise<Minion[]> {
        return this.minions;
    }

    /**
     * Get minion by id.
     * @param minionId minion id.
     */
    public async getMinionById(minionId: string): Promise<Minion> {
        const minion = this.findMinion(minionId);

        if (!minion) {
            throw {
                responseCode: 4004,
                message: 'minion not exist',
            } as ErrorResponse;
        }
        return minion;
    }

    /**
     * Scan all minions real status.
     * mean update minions cache by request each device what is the real status.
     */
    public async scanMinionsStatus(): Promise<void> {
        await this.readMinionsStatus();
    }

    /**
     * Scan minion real status.
     * mean update minions cache by request the device what is the real status.
     */
    public async scanMinionStatus(minionId: string): Promise<void> {
        const minioin = this.findMinion(minionId);
        if (!minioin) {
            throw {
                responseCode: 4004,
                message: 'minion not exist',
            } as ErrorResponse;
        }
        await this.readMinionStatus(minioin);
    }

    /**
     * Set minon status
     * @param minionId minion to set new status to.
     * @param minionStatus the status to set.
     */
    public async setMinionStatus(minionId: string, minionStatus: MinionStatus): Promise<void> {
        const minion = this.findMinion(minionId);
        if (!minion) {
            throw {
                responseCode: 4004,
                message: 'minion not exist',
            } as ErrorResponse;
        }

        /**
         * The minion status is depend on minion type.
         */
        if (!minionStatus[minion.minionType]) {
            throw {
                responseCode: 4122,
                message: 'incorrect minion status, for current minion type',
            } as ErrorResponse;
        }

        /**
         * set the status.
         */
        await this.modulesManager.setStatus(minion, minionStatus);

        /**
         * If success, update minion to new status.
         */
        minion.minionStatus = minionStatus;

        /**
         * Send minions feed update.
         */
        this.minionFeed.next({
            event: 'update',
            minion,
        });
    }

    /**
     * Set minoin timeout property.
     */
    public async setMinionTimeout(minionId: string, minion: Minion): Promise<void> {
        const originalMinion = this.findMinion(minionId);
        if (!originalMinion) {
            throw {
                responseCode: 4004,
                message: 'minion not exist',
            } as ErrorResponse;
        }

        originalMinion.minionAutoTurnOffMS = minion.minionAutoTurnOffMS;

        /**
         * Send minion feed update
         */
        this.minionFeed.next({
            event: 'update',
            minion: originalMinion,
        });
    }

    /**
     * Create new minon
     * @param minion minon to create.
     */
    public async createMinion(minion: Minion): Promise<void> {

        /**
         * check if minion valid.
         */
        const error = this.validateNewMinion(minion);
        if (error) {
            throw error;
        }

        /**
         * get local devices (to load corrent pysical info such as ip)
         */
        const localDevices = await this.devicesBl.getDevices();
        let foundLocalDevice = false;
        for (const localDevice of localDevices) {
            if (localDevice.mac === minion.device.pysicalDevice.mac) {
                minion.device.pysicalDevice = localDevice;
                foundLocalDevice = true;
                break;
            }
        }

        if (!foundLocalDevice) {
            throw {
                responseCode: 4522,
                message: 'device not exist in lan network',
            } as ErrorResponse;
        }

        /**
         * Generate new id. (never trust client....)
         */
        minion.minionId = randomstring.generate(5);

        /**
         * Create new minion in dal.
         */
        await this.minionsDal.createMinion(minion);

        /**
         * Send create new minion feed update (*befor* try to get the status!!!)
         */
        this.minionFeed.next({
            event: 'created',
            minion,
        });

        /**
         * Try to get current status.
         */
        await this.modulesManager.getStatus(minion)
            .then((status: MinionStatus) => {
                minion.minionStatus = status;
            })
            .catch(() => {

            });
    }

    /**
     * Delete minoin
     * @param minionId minion id to delete
     */
    public async deleteMinion(minionId: string): Promise<void> {
        const originalMinion = this.findMinion(minionId);
        if (!originalMinion) {
            throw {
                responseCode: 4004,
                message: 'minion not exist',
            } as ErrorResponse;
        }

        await this.minionsDal.deleteMinion(originalMinion);

        // The minoins arrat is given from DAL by ref, mean if removed
        // from dal it will removed from BL too, so check if exist
        // (if in next someone will copy by val) and then remove.
        if (this.minions.indexOf(originalMinion) !== -1) {
            this.minions.splice(this.minions.indexOf(originalMinion), 1);
        }

        this.minionFeed.next({
            event: 'removed',
            minion: originalMinion,
        })
    }
}

export const MinionsBlSingleton = new MinionsBl(MinionsDalSingleton, DevicesBlSingleton, ModulesManagerSingltone);
