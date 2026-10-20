import request from '@/utils/request';

/**
 * 资源项基础接口
 * 注意：根据实际后端返回字段修改此接口
 */
interface Resource {
  id?: number;          // 资源ID
  name?: string;        // 资源名称
  type?: string;        // 资源类型
  price?: number;       // 资源价格
  description?: string; // 资源描述
  [key: string]: any;   // 扩展字段
}

/**
 * 分页数据接口
 */
interface PaginatedResources {
  items: Resource[];    // 当前页数据列表
  total: number;        // 总数据量
  page: number;         // 当前页码
  per_page: number;     // 每页条数
}

/**
 * 资源搜索参数接口
 */
interface SearchParams {
  keyword?: string;     // 搜索关键词
  type?: string;        // 资源类型筛选
  min_price?: number;   // 最低价格
  max_price?: number;   // 最高价格
  page?: number;        // 页码
  per_page?: number;    // 每页数量
}

/**
 * 获取资源列表
 * @param page - 当前页码（默认1）
 * @param per_page - 每页数量（默认10）
 * @returns 带分页信息的资源列表
 */
export const listResources = (page: number = 1, per_page: number = 10): Promise<PaginatedResources> => {
  return request({
    url: '/user/resources',
    method: 'get',
    params: {
      page,
      per_page
    }
  });
};

/**
 * 获取资源详情
 * @param resource_id - 资源ID
 * @returns 资源详情数据
 * @throws 当资源不存在时返回404错误
 */
export const getResourceDetail = (resource_id: number): Promise<Resource> => {
  return request({
    url: `/user/resources/${resource_id}`,
    method: 'get'
  });
};

/**
 * 创建新资源
 * @param data - 资源数据
 * @returns 新创建的资源数据
 * @throws 未授权时返回401错误
 */
export const createResource = (data: Resource): Promise<Resource> => {
  return request({
    url: '/user/resources',
    method: 'post',
    data
  });
};

/**
 * 更新资源
 * @param resource_id - 要更新的资源ID
 * @param data - 更新后的资源数据
 * @returns 更新后的资源数据
 * @throws 未授权或资源不存在时返回错误
 */
export const updateResource = (resource_id: number, data: Resource): Promise<Resource> => {
  return request({
    url: `/user/resources/${resource_id}`,
    method: 'put',
    data
  });
};

/**
 * 删除资源
 * @param resource_id - 要删除的资源ID
 * @throws 未授权或资源不存在时返回错误
 */
export const deleteResource = (resource_id: number): Promise<void> => {
  return request({
    url: `/user/resources/${resource_id}`,
    method: 'delete'
  });
};

/**
 * 搜索资源
 * @param params - 搜索参数对象
 *        - keyword: 关键词搜索
 *        - type: 按类型筛选
 *        - price: 价格区间筛选
 *        - pagination: 分页参数
 * @returns 符合条件的分页资源列表
 */
export const searchResources = (params: SearchParams): Promise<PaginatedResources> => {
  return request({
    url: '/user/resources/search',
    method: 'get',
    params: {
      keyword: params.keyword,
      type: params.type,
      min_price: params.min_price,
      max_price: params.max_price,
      page: params.page || 1,
      per_page: params.per_page || 10
    }
  });
};


export const incrementDownloadCount = (resource_id: number): Promise<void> => {
  return request({
    url: `/user/download/${resource_id}`,
    method: 'post'
  });
};

/**
 * 把素材引用到自己的某个项目（幂等）
 * @param resource_id - 素材ID
 * @param project_id - 目标项目ID
 */
export const referenceResource = (resource_id: number, project_id: number): Promise<any> => {
  return request({
    url: `/user/resources/${resource_id}/reference`,
    method: 'post',
    data: { project_id }
  });
};

/**
 * 取消素材对某项目的引用（幂等）
 * @param resource_id - 素材ID
 * @param project_id - 目标项目ID
 */
export const unreferenceResource = (resource_id: number, project_id: number): Promise<any> => {
  return request({
    url: `/user/resources/${resource_id}/reference`,
    method: 'delete',
    params: { project_id }
  });
};
