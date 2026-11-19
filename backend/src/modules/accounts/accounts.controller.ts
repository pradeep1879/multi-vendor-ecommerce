import type { RequestHandler } from 'express';
import { getAuthContext } from '../../common/middleware/authentication';
import { sendData } from '../../common/middleware/response';
import { getValidatedRequest } from '../../common/validation/validate-request';
import type { AccountsService } from './accounts.service';

type AddressBody = {
  type: 'SHIPPING' | 'BILLING' | 'BOTH';
  recipient: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  locality?: string | null;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  isDefault: boolean;
};

type ApplicationBody = {
  businessName: string;
  legalName: string;
  contactEmail: string;
  contactPhone: string;
};

export function createAccountsController(service: AccountsService) {
  const listCustomers: RequestHandler = async (_request, response) => {
    const query = getValidatedRequest<{ query: { page: number; pageSize: number } }>(
      response,
    ).query;
    const result = await service.listCustomers((query.page - 1) * query.pageSize, query.pageSize);
    sendData(response, { customers: result.customers }, 200, {
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    });
  };

  const setCustomerDisabled =
    (disabled: boolean): RequestHandler =>
    async (_request, response) => {
      const { userId } = getValidatedRequest<{ params: { userId: string } }>(response).params;
      sendData(response, {
        customer: await service.setCustomerDisabled({
          userId,
          disabled,
          actorId: getAuthContext(response).userId,
        }),
      });
    };
  const me: RequestHandler = async (_request, response) => {
    sendData(response, { user: await service.getProfile(getAuthContext(response).userId) });
  };

  const updateMe: RequestHandler = async (_request, response) => {
    const body = getValidatedRequest<{ body: { name?: string; phone?: string | null } }>(
      response,
    ).body;
    sendData(response, {
      user: await service.updateProfile(getAuthContext(response).userId, body),
    });
  };

  const listAddresses: RequestHandler = async (_request, response) => {
    sendData(response, { addresses: await service.listAddresses(getAuthContext(response).userId) });
  };

  const createAddress: RequestHandler = async (_request, response) => {
    const body = getValidatedRequest<{ body: AddressBody }>(response).body;
    sendData(
      response,
      { address: await service.createAddress(getAuthContext(response).userId, body) },
      201,
    );
  };

  const updateAddress: RequestHandler = async (_request, response) => {
    const { addressId } = getValidatedRequest<{ params: { addressId: string } }>(response).params;
    const body = getValidatedRequest<{ body: Partial<AddressBody> }>(response).body;
    sendData(response, {
      address: await service.updateAddress(getAuthContext(response).userId, addressId, body),
    });
  };

  const deleteAddress: RequestHandler = async (_request, response) => {
    const { addressId } = getValidatedRequest<{ params: { addressId: string } }>(response).params;
    await service.deleteAddress(getAuthContext(response).userId, addressId);
    response.status(204).end();
  };

  const applyVendor: RequestHandler = async (_request, response) => {
    const body = getValidatedRequest<{ body: ApplicationBody }>(response).body;
    const application = await service.submitApplication(getAuthContext(response).userId, body);
    sendData(response, { application }, 201);
  };

  const myApplication: RequestHandler = async (_request, response) => {
    sendData(response, {
      application: await service.getMyApplication(getAuthContext(response).userId),
    });
  };

  const listApplications: RequestHandler = async (_request, response) => {
    const query = getValidatedRequest<{
      query: { page: number; pageSize: number; status?: 'PENDING' | 'APPROVED' | 'REJECTED' };
    }>(response).query;
    const skip = (query.page - 1) * query.pageSize;
    const [applications, total] = await service.listApplications(
      query.status,
      skip,
      query.pageSize,
    );
    sendData(response, { applications }, 200, {
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  };

  const applicationDetail: RequestHandler = async (_request, response) => {
    const { applicationId } = getValidatedRequest<{ params: { applicationId: string } }>(
      response,
    ).params;
    sendData(response, { application: await service.getApplication(applicationId) });
  };

  const decide =
    (decision: 'APPROVED' | 'REJECTED'): RequestHandler =>
    async (_request, response) => {
      const { applicationId } = getValidatedRequest<{ params: { applicationId: string } }>(
        response,
      ).params;
      const { reason } = getValidatedRequest<{ body: { reason: string } }>(response).body;
      const result = await service.decideApplication({
        applicationId,
        reviewerId: getAuthContext(response).userId,
        decision,
        reason,
      });
      sendData(response, result);
    };

  const suspendVendor: RequestHandler = async (_request, response) => {
    const { vendorId } = getValidatedRequest<{ params: { vendorId: string } }>(response).params;
    const { reason } = getValidatedRequest<{ body: { reason: string } }>(response).body;
    sendData(response, {
      vendor: await service.suspendVendor({
        vendorId,
        reviewerId: getAuthContext(response).userId,
        reason,
      }),
    });
  };

  const getVendor: RequestHandler = async (_request, response) => {
    sendData(response, { vendor: await service.getVendor(getAuthContext(response).userId) });
  };

  const updateVendor: RequestHandler = async (_request, response) => {
    const body = getValidatedRequest<{ body: { name?: string; description?: string | null } }>(
      response,
    ).body;
    sendData(response, {
      vendor: await service.updateVendor(getAuthContext(response).userId, body),
    });
  };

  return {
    listCustomers,
    disableCustomer: setCustomerDisabled(true),
    enableCustomer: setCustomerDisabled(false),
    me,
    updateMe,
    listAddresses,
    createAddress,
    updateAddress,
    deleteAddress,
    applyVendor,
    myApplication,
    listApplications,
    applicationDetail,
    approve: decide('APPROVED'),
    reject: decide('REJECTED'),
    suspendVendor,
    getVendor,
    updateVendor,
  };
}
